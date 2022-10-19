export interface VeluxDevice {
  id: string
  battery_state: string
  current_position: number
  firmware_revision: number
  last_seen: number
  manufacturer: string
  mode: string
  reachable: boolean
  silent: boolean
  target_position: number
  type: string
  velux_type: string
  bridge: string
}
