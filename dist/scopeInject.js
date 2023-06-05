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
// TAG 标识符》》   //HACK ScopeInject<{"url":"./hook"}>
function scopeInject() {
    return {
        name: 'vite-plugin-vue-scope-inject',
        transform(code, id) {
            // 在这里拦截导入的模块，并进行自定义处理
            if (id.endsWith('.vue') && findSymbol(code)) {
                // 获取配置
                const option = getOption(code);
                if (!option.url)
                    return;
                // 要融入的数据的hooks文件夹路径
                const targetHookUrl = (0, path_1.resolve)((0, path_1.dirname)(id), option.url);
                // 所有hooks文件夹里文件的路径
                const allFiles = getAllFilesInDirectory(targetHookUrl);
                //全部的模块数据 将被处理后 移入此容器内，后续插入到.vue作用域中
                const { hooksData } = parseTemplateData(allFiles, targetHookUrl);
                const replaceData = Object.values(hooksData).join(';');
                code = code.replace(/[\/\\][\/\\]\s*HACK ScopeInject<(\{.*?\})>/g, replaceData);
                // 最后 将代码中 原有的引入给删掉
                if (option.type !== 'inside') {
                    code = removeOldImport(code, option.url);
                }
                // 导出的数据中 把上面检查到的 export 的变量 也导出
                // code = code.replace('const __returned__ = {', 'const __returned__ = {'+allLets.all.join(',')+',')
                // code = code.replace('const __returned__ = {', 'const __returned__ = { msg,')
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
    let option = null;
    const matches = code.match(optionReg);
    if (matches && matches.length > 1) {
        const objectString = matches[1];
        option = JSON.parse(objectString);
    }
    return option;
}
// 转换模板文件数据
function parseTemplateData(allFiles, targetHookUrl) {
    const hooksData = {};
    const allLets = { lets: [], functions: [], all: [] };
    allFiles.forEach((directory) => {
        // 根据换行分割为数组
        const contentArr = readFileContent(directory).replace(/[\n]/g, '\r').split('\r');
        // 遍历每一行
        for (const index in contentArr) {
            const contentLine = contentArr[index];
            if (contentLine.includes('import')) {
                // 查看这个引入的数据是否是当前hooks目录下的
                const importDataPath = contentLine.split('from')[1].replace(/'/g, '').trim();
                // 如果引入数据的文件就是在hooks里面，那就去掉它，无需引入
                const validPath = (0, path_1.resolve)(targetHookUrl, importDataPath);
                // 对比是否有符号条件的路径
                if (allFiles.some((path) => {
                    return (0, path_1.resolve)(path.replace(/(.ts)|(.d.ts)/g, '')) === validPath.replace(/(.ts)|(.d.ts)/g, '');
                })) {
                    // 将这一行变成空字符串，同时避免了顺序出现问题
                    contentArr[index] = '';
                }
            }
            // 遇到导出就不再寻找，优化速度，同时也严格限制了  import代码 放在最上面
            if (contentLine.includes('export')) {
                break;
            }
        }
        // 回归原有文本
        const backStr = contentArr.join('\r');
        // XXX 取得所有的导出的变量 也就是算作全局的变量     这个暂时无用了，之后可能有用
        // allLets = getAllVariableDeclaration(backStr)
        // 去掉export 和 export default
        hooksData[(0, path_1.basename)(directory)] = backStr.replace(/export default|export/g, '');
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
    // while ((match = constReg.exec(code))) {
    //   consts.push(match[1]);
    // }
    return {
        lets,
        functions,
        // consts,
        all: [...new Set([...lets, ...functions])]
    };
}
// 删掉源文件里的import
function removeOldImport(code, path) {
    const regex = new RegExp(`import\\s*{[^}]+}\\s*from\\s*['"](${path}[^'"]+)['"];`, 'g');
    code = code.replace(regex, '');
    return code;
}
