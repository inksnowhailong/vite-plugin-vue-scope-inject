## 简介

用于修复 vue3 引用外部 ts 文件中的数据的一些问题，当然也可以用作其他自动化用途
用于将指定文件夹下第一层的.ts 结尾内容，直接注入指定位置。

**“目前”主要为了解决以下问题：**

- 😒 当 vue 引用外层 ts 文件里面 export 的数据时，这个 vue 文件如果是一个页面的组件，页面离开再回来后，那些数据并不会初始化为初始状态
- 😒 当 vue 引用外层 ts 文件里面 export 的数据时,如果使用 v-for 或者多个位置引用这个组件，那么引用的将是同一个 ts 里的数据，一个组件对其修改，另一个也会跟着变，会导致严重问题。

#### 扩展使用

- 一些全局方法直接注入作用域，免于使用 import，这在 vscode 的字段寻找引入内容不好用时候，或者引入一大堆东西，想要优化显示的代码行数时候，十分有用

#### 使用方法

在**vite.config.ts**中
**👉👉 这个插件 要在@vitejs/plugin-vue 插件之前执行**

```javascript
import scopeInject from "scopeinject";
import vue from "@vitejs/plugin-vue";
// NOTE 这个插件 要在@vitejs/plugin-vue插件之前执行
export default defineConfig({
  plugins: [scopeInject(), vue()],
});
```

然后在 xxx.vue 中插入标识注释 🫱 **//HACK ScopeInject<{"url":"./hook"}>** 🫲
目前配置项只有 url 也就是指定的文件夹路径，**请务必<>里面使用 JSON 格式**

```javascript
<script setup lang='ts'>

//HACK ScopeInject<{"url":"./hook"}>
</script>

<template >
    <div class="index">

    </div>
</template>

<style scoped lang='less'>

</style>

```
