import { defineStore } from 'pinia'

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: '值班管理员',
    shiftLabel: '白班 08:00-20:00',
    scope: '城市供水厂制水运行与供水调度管理平台',
    // 当前出勤片区：稽查车按片区出勤，跨片区递上来的改动算越权。
    district: '城东片区',
  }),
  getters: {
    canOperate: (state) => state.operator.length > 0,
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    setDistrict(label: string) {
      this.district = label
    },
  },
})
