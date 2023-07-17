"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = require("path");
const fs_1 = __importDefault(require("fs"));
// NOTE  禁止使用 export default
// NOTE  只针对.ts和.d.ts
// NOTE  import 语句必须在最上面
// NOTE  不要使用from export import 关键字作为变量名
// NOTE 需要导入的内容 必须export
// TODO 类型文件以扩展方式加入到vue组件中
// TODO 目前对标识符的识别，没有兼容 对象里面嵌套另一个对象的情况，只能兼容一维对象
// TAG 标识符》》   //HACK ScopeInject<{"url":"./hook","debug":true}>
function scopeInject() {
    let _server = null;
    return {
        name: 'vite-plugin-vue-scope-inject',
        configureServer(server) {
            _server = server;
        },
        transform(code, id) {
            // 在这里拦截导入的模块，并进行自定义处理
            if (id.endsWith('.vue') && findSymbol(code)) {
                // 获取配置
                const option = getOption(code);
                if (!option.url)
                    return;
                // 要融入的数据的hooks文件夹路径
                const targetHookUrl = (0, path_1.resolve)((0, path_1.dirname)(id), option.url);
                // 所有指定文件夹里文件的路径
                const allFiles = getAllFilesInDirectory(targetHookUrl);
                // 直接文件之后内容会被迁移到页面，就会失去响应式监听，这里主动加入对其的响应式热更新监听
                watcherAddFile(_server, allFiles, id);
                //全部的模块数据 将被处理后 移入此容器内，后续插入到.vue作用域中
                const { hooksData } = parseTemplateData(allFiles, targetHookUrl, option);
                const replaceData = Object.values(hooksData).join(';');
                code = code.replace(/\/\/\s*HACK ScopeInject<(\{.*?\})>/g, replaceData.replace(/\r\r/g, '\r\n'));
                // 最后 将代码中 原有的引入给删掉
                // if (option.type !== 'inside') {
                code = removeOldImport(code, option.url);
                // }
                if (option.debug) {
                    console.log(code);
                }
            }
            return {
                code,
                map: null
            };
        }
    };
}
exports.default = scopeInject;
//  查找目录下所有文件路径
function getAllFilesInDirectory(directory) {
    const files = fs_1.default.readdirSync(directory);
    const filePaths = [];
    files.forEach((file) => {
        const filePath = (0, path_1.join)(directory, file);
        const stat = fs_1.default.statSync(filePath);
        if (stat.isFile()) {
            filePaths.push(filePath);
        }
        else if (stat.isDirectory()) {
            const subDirectoryFiles = getAllFilesInDirectory(filePath);
            filePaths.push(...subDirectoryFiles);
        }
    });
    return filePaths.filter((path) => /.ts$/g.test(path));
}
//读取文件内容
function readFileContent(filePath) {
    try {
        const fileContent = fs_1.default.readFileSync(filePath, 'utf-8');
        return fileContent;
    }
    catch (error) {
        console.error(`Error reading file: ${filePath}`);
        console.error(error);
        return '';
    }
}
// 识别特殊符号
function findSymbol(code) {
    return /[\/\\][\/\\]\s*HACK ScopeInject</g.test(code);
}
// 获取参数配置
function getOption(code) {
    const optionReg = /[\/\\][\/\\]\s*HACK ScopeInject<(\{.*?\})>/;
    let option = {
        url: ''
    };
    const matches = code.match(optionReg);
    if (matches && matches.length > 1) {
        const objectString = matches[1];
        option = JSON.parse(objectString);
    }
    return option;
}
// 转换模板文件数据
function parseTemplateData(allFiles, targetHookUrl, option) {
    const hooksData = {};
    const allLets = { lets: [], functions: [], all: [] };
    allFiles.forEach((directory) => {
        // 根据换行分割为数组
        const regex = new RegExp(`import\\s*{[^}]+}\\s*from\\s*['"]\\.\\/([^'"]+)['"]`, 'g');
        const code = readFileContent(directory)?.replace(regex, '');
        // if(option.debug){
        //   console.log('code :>> ', code);
        // // 回归原有文本
        // const backStr = contentArr.join('\r')
        // XXX 取得所有的导出的变量 也就是算作全局的变量     这个暂时无用了，之后可能有用
        // 去掉export 和 export default
        hooksData[(0, path_1.basename)(directory)] = code.replace(/export default|export/g, '');
    });
    return {
        hooksData,
        allLets
    };
}
// 获取全部变量
function getAllVariableDeclaration(code) {
    const letReg = /(?:export const|export let|export var)\s+([\w$]+)/g;
    const functionReg = /(?:export function|export async function)\s+([\w$]+)/g;
    // const constReg = /(?:export const|export let|export var)\s+([\w$]+)\s*=/g;
    const lets = [];
    const functions = [];
    const consts = [];
    let match;
    while ((match = letReg.exec(code))) {
        lets.push(match[1]);
    }
    while ((match = functionReg.exec(code))) {
        functions.push(match[1]);
    }
    return {
        lets,
        functions,
        // consts,
        all: [...new Set([...lets, ...functions])]
    };
}
// 删掉源文件里的import
function removeOldImport(code, path) {
    const regex = new RegExp(`import\\s*{[^}]+}\\s*from\\s*['"](${path}[^'"]+)['"]`, 'g');
    code = code.replace(regex, '');
    return code;
}
// 建立一个容器，记录已经添加过的监听器，防止重复监听
const serverNewChangeMap = new Map();
// 添加对构建入 页面的ts文件的热更新
function watcherAddFile(_server, allFiles, id) {
    if (!_server)
        return;
    // 如何未对这个files组合的内容监听过，添加一个新的监听
    if (!serverNewChangeMap.has(id)) {
        serverNewChangeMap.set(id, allFiles);
        _server.watcher.on('change', (file) => {
            if (allFiles.some((path) => {
                return (0, path_1.resolve)(path) === (0, path_1.resolve)(file);
            })) {
                const moduleVue = _server.moduleGraph.getModuleById(id);
                _server.moduleGraph.invalidateModule(moduleVue);
                // vite 低版本 没这个函数 就只能手动刷新页面来响应式更新监听的ts文件的变更
                _server?.reloadModule?.(moduleVue);
            }
        });
    }
    // const watchedPaths = _server.watcher.getWatched()
}
