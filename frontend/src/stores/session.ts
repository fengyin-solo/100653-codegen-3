import { defineStore } from 'pinia'

// 稽查车按片区出勤：当前片区决定能不能动某片区的稽查单，跨片区改动由 service 打回。
export const DUTY_ZONES = ['河东片区', '河西片区', '南郊片区', '北郊片区'] as const
export type DutyZone = (typeof DUTY_ZONES)[number]

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: '值班管理员',
    shiftLabel: '白班 08:00-20:00',
    scope: '城市供水厂制水运行与供水调度管理平台',
    dutyZone: '河东片区' as DutyZone,
  }),
  getters: {
    canOperate: (state) => state.operator.length > 0,
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    setDutyZone(zone: DutyZone) {
      this.dutyZone = zone
    },
  },
})
