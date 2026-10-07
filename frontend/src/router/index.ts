import { createRouter, createWebHistory } from 'vue-router'

import Dashboard from '@/views/Dashboard.vue'
const Block = () => import('@/views/block/index.vue')
const Workshop = () => import('@/views/workshop/index.vue')
const Cutting = () => import('@/views/cutting/index.vue')
const AssemblySmall = () => import('@/views/assembly_small/index.vue')
const AssemblyMedium = () => import('@/views/assembly_medium/index.vue')
const Ndt = () => import('@/views/ndt/index.vue')
const Erection = () => import('@/views/erection/index.vue')
const WeldingTrace = () => import('@/views/welding_trace/index.vue')
const Blasting = () => import('@/views/blasting/index.vue')
const Painting = () => import('@/views/painting/index.vue')
const Outfitting = () => import('@/views/outfitting/index.vue')
const Dimension = () => import('@/views/dimension/index.vue')
const PipePrefab = () => import('@/views/pipe_prefab/index.vue')
const CablePull = () => import('@/views/cable_pull/index.vue')
const LaunchPrep = () => import('@/views/launch_prep/index.vue')
const Quality = () => import('@/views/quality/index.vue')
const Schedule = () => import('@/views/schedule/index.vue')
const Material = () => import('@/views/material/index.vue')
const Scaffold = () => import('@/views/scaffold/index.vue')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: Dashboard },
    { path: '/workshop', name: 'workshop', component: Workshop },
    { path: '/block', name: 'block', component: Block },
    { path: '/cutting', name: 'cutting', component: Cutting },
    { path: '/assembly_small', name: 'assembly_small', component: AssemblySmall },
    { path: '/assembly_medium', name: 'assembly_medium', component: AssemblyMedium },
    { path: '/ndt', name: 'ndt', component: Ndt },
    { path: '/erection', name: 'erection', component: Erection },
    { path: '/welding_trace', name: 'welding_trace', component: WeldingTrace },
    { path: '/blasting', name: 'blasting', component: Blasting },
    { path: '/painting', name: 'painting', component: Painting },
    { path: '/outfitting', name: 'outfitting', component: Outfitting },
    { path: '/dimension', name: 'dimension', component: Dimension },
    { path: '/pipe_prefab', name: 'pipe_prefab', component: PipePrefab },
    { path: '/cable_pull', name: 'cable_pull', component: CablePull },
    { path: '/launch_prep', name: 'launch_prep', component: LaunchPrep },
    { path: '/quality', name: 'quality', component: Quality },
    { path: '/schedule', name: 'schedule', component: Schedule },
    { path: '/material', name: 'material', component: Material },
    { path: '/scaffold', name: 'scaffold', component: Scaffold },
  ],
})

export default router
