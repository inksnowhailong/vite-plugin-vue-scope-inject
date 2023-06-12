import { resolve, dirname, basename, join } from 'path'
import fs from 'fs'
// NOTE  禁止使用 export default
// NOTE  只针对.ts和.d.ts
// NOTE  import 语句必须在最上面
// NOTE  不要使用from export import 关键字作为变量名
// NOTE 需要导入的内容 必须export
// TODO 类型文件以扩展方式加入到vue组件中
// TODO 目前对标识符的识别，没有兼容 对象里面嵌套另一个对象的情况，只能兼容一维对象
// TAG 标识符》》   //HACK ScopeInject<{"url":"./hook","debug":true}>
export default function scopeInject() {
  let _server: any = null
  return {
    name: 'vite-plugin-vue-scope-inject',
    configureServer(server: any) {
      _server = server
    },
    transform(code: string, id: string) {
      // 在这里拦截导入的模块，并进行自定义处理
      if (id.endsWith('.vue') && findSymbol(code)) {
        // 获取配置
        const option = getOption(code)
        if (!option.url || !id.includes('targetMonitor')) return
        // 要融入的数据的hooks文件夹路径
        const targetHookUrl = resolve(dirname(id), option.url)
        // 所有指定文件夹里文件的路径
        const allFiles = getAllFilesInDirectory(targetHookUrl)
        // 直接文件之后内容会被迁移到页面，就会失去响应式监听，这里主动加入对其的响应式热更新监听
        _server.watcher.on('change', (file:string) => {
          if (
            allFiles.some((path: string) => {
              return resolve(path) === resolve(file)
            })
          ) {
            const moduleVue = _server.moduleGraph.getModuleById(id)
            _server.moduleGraph.invalidateModule(moduleVue)
            // vite 低版本 没这个函数 就只能手动刷新页面来响应式更新监听的ts文件的变更
            _server?.reloadModule?.(moduleVue)
          }
        })
        // const watchedPaths = _server.watcher.getWatched()
        //全部的模块数据 将被处理后 移入此容器内，后续插入到.vue作用域中
        const { hooksData } = parseTemplateData(allFiles, targetHookUrl)
        const replaceData = Object.values(hooksData).join(';')
        code = code.replace(/\/\/\s*HACK ScopeInject<(\{.*?\})>/g, replaceData.replace(/\r\r/g,'\r\n'))
        // 最后 将代码中 原有的引入给删掉
        // if (option.type !== 'inside') {
        code = removeOldImport(code, option.url)
        // }
        if (option.debug) {
          console.log(
            code
          )
        }
      }
      return {
        code,
        map: null
      }
    }
  }
}
//  查找目录下所有文件路径
function getAllFilesInDirectory(directory: string) {
  const files = fs.readdirSync(directory)
  const filePaths: string[] = []

  files.forEach((file: any) => {
    const filePath = join(directory, file)
    const stat = fs.statSync(filePath)

    if (stat.isFile()) {
      filePaths.push(filePath)
    } else if (stat.isDirectory()) {
      const subDirectoryFiles = getAllFilesInDirectory(filePath)
      filePaths.push(...subDirectoryFiles)
    }
  })

  return filePaths.filter((path: string) => /.ts$/g.test(path))
}

//读取文件内容
function readFileContent(filePath: string) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    return fileContent
  } catch (error) {
    console.error(`Error reading file: ${filePath}`)
    console.error(error)
    return ''
  }
}

// 识别特殊符号
function findSymbol(code: string) {
  return /[\/\\][\/\\]\s*HACK ScopeInject</g.test(code)
}
// 获取参数配置
function getOption(code: string) {
  const optionReg = /[\/\\][\/\\]\s*HACK ScopeInject<(\{.*?\})>/
  let option: {
    url?: string
    debug?: boolean
  } = {}

  const matches = code.match(optionReg)
  if (matches && matches.length > 1) {
    const objectString = matches[1]
    option = JSON.parse(objectString)
  }
  return option
}
// 转换模板文件数据
function parseTemplateData(allFiles: string[], targetHookUrl: string) {
  const hooksData: { [key: string]: any } = {}
  const allLets: {
    lets: string[]
    functions: string[]
    all: string[]
  } = { lets: [], functions: [], all: [] }
  allFiles.forEach((directory: string) => {
    // 根据换行分割为数组

    const contentArr = readFileContent(directory).replace(/[\n]/g, '\\r').split('\\r')
    // 遍历每一行
    for (const index in contentArr) {
      const contentLine = contentArr[index]
      if (contentLine.includes('import')) {
        // 查看这个引入的数据是否是当前hooks目录下的
        const importDataPath = contentLine.split('from')[1].replace(/'/g, '').trim()
        // 如果引入数据的文件就是在hooks里面，那就去掉它，无需引入
        const validPath = resolve(targetHookUrl, importDataPath)

        // 对比是否有符号条件的路径
        if (
          allFiles.some((path: string) => {
            return resolve(path.replace(/(.ts)|(.d.ts)/g, '')) === validPath.replace(/(.ts)|(.d.ts)/g, '')
          })
        ) {
          // 将这一行变成空字符串，同时避免了顺序出现问题

          contentArr[index] = ''
        }
      }
      // 遇到导出就不再寻找，优化速度，同时也严格限制了  import代码 放在最上面
      if (contentLine.includes('export')) {
        break
      }
    }
    // 回归原有文本
    const backStr = contentArr.join('\r')
    // XXX 取得所有的导出的变量 也就是算作全局的变量     这个暂时无用了，之后可能有用
    // 去掉export 和 export default
    hooksData[basename(directory)] = backStr.replace(/export default|export/g, '')
  })
  return {
    hooksData,
    allLets
  }
}
// 获取全部变量
function getAllVariableDeclaration(code: string) {
  const letReg = /(?:export const|export let|export var)\s+([\w$]+)/g
  const functionReg = /(?:export function|export async function)\s+([\w$]+)/g
  // const constReg = /(?:export const|export let|export var)\s+([\w$]+)\s*=/g;

  const lets = []
  const functions = []
  const consts = []

  let match: any

  while ((match = letReg.exec(code))) {
    lets.push(match[1])
  }

  while ((match = functionReg.exec(code))) {
    functions.push(match[1])
  }


  return {
    lets,
    functions,
    // consts,
    all: [...new Set([...lets, ...functions])]
  }
}

// 删掉源文件里的import
function removeOldImport(code: string, path: string) {
  const regex = new RegExp(`import\\s*{[^}]+}\\s*from\\s*['"](${path}[^'"]+)['"]`, 'g')
  code = code.replace(regex, '')
  return code
}
// 添加对构建入 页面的ts文件的热更新
function watcherAddFile() {}
