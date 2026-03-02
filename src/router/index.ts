import { createRouter, createWebHistory } from 'vue-router'
import DisplayView from '../views/DisplayView.vue'
import ShakeView from '../views/ShakeView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: DisplayView },
    { path: '/shake', component: ShakeView },
  ],
})
