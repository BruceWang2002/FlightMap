<template>
  <div class="gradient-container">
    <div 
      v-for="(item, index) in gradientItems" 
      :key="index"
      class="gradient-bar"
      :style="{ background: item.background }"
    >
      <!-- 渐变条内可以包含一些文本或其他内容 -->
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const gradientItems = ref([
  {
    background: 'linear-gradient(to right, #656866, #c2523c)',
    
  },
  {
    background: 'linear-gradient(to right,  #c2523c, #db7a25)',
    // label: '600'
  },
  {
    background: 'linear-gradient(to right, #db7a25, #fcf003)',
    // label: '2000'
  },
  {
    background: 'linear-gradient(to right, #fcf003, #7bed00)',
    // label: '4000'
  },
  {
    background: 'linear-gradient(to right, #7bed00, #06d41b)',
     //  label: '6000'
  },
  {
    background: 'linear-gradient(to right, #06d41b, #1ba87c)',
     //label: '8000'
  },
  {
    background: 'linear-gradient(to right,#1ba87c, #18758c)',
    // label: '10000'
  },
  {
    background: 'linear-gradient(to right,#18758c, #0b2c7a)',
    // label: '12000'
  },
  // 可以根据需要添加更多的渐变条
]);
</script>

<style scoped>
.gradient-container {
  display: flex;
  align-items: center; /* 垂直居中对齐子元素 */
  justify-content: flex-end; /* 子元素靠右对齐 */
  width: 100%; /* 父容器宽度充满 */
  height: 10px; /* 父容器高度 */
}

.gradient-bar {
  flex: 1; /* 每个渐变条平均分配空间 */
  margin: 0 0px; /* 给每个渐变条一些左右的外边距，除了首尾 */
  height: 100%; /* 渐变条高度占满父容器高度 */
  /* 背景渐变通过 :style 动态绑定 */
}

/* 移除第一个和最后一个渐变条的左边距和右边距 */
.gradient-container > .gradient-bar:first-child {
  margin-left: 0;
}
.gradient-container > .gradient-bar:last-child {
  margin-right: 0;
}



</style>