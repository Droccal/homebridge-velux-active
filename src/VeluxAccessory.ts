import {PlatformAccessory, Service} from 'homebridge'

import {VeluxActivePlatform} from './platform'
import {VeluxDevice} from './VeluxDevice'
import fetch from 'node-fetch'

export class VeluxAccessory {
    private service: Service | undefined

    constructor (
      private readonly platform: VeluxActivePlatform,
      private readonly accessory: PlatformAccessory,
      private readonly device: VeluxDevice
    ) {
        this.platform.log.info(`Initializing Velux ${device.velux_type}`)
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, device.manufacturer)
            .setCharacteristic(this.platform.Characteristic.Model, device.velux_type)
            .setCharacteristic(this.platform.Characteristic.SerialNumber, device.id)

        // create a new Window Covering service
        if (device.velux_type === 'window') {
            this.service = this.accessory.getService(this.platform.Service.Window) ||
              this.accessory.addService(this.platform.Service.Window, `Window ${device.id}`, 'cl9gre9tm0000rj664gpx42pf')
        } else if (device.velux_type === 'shutter') {
            this.service = this.accessory.getService(this.platform.Service.WindowCovering) ||
              this.accessory.addService(this.platform.Service.WindowCovering, `Shutter ${device.id}`, 'cl9grh82v0001rj66tq1fgtta')
        } else {
            this.platform.log.error('Not supported device type discovered')
            return
        }

        this.service.setCharacteristic(this.platform.Characteristic.Name, (`Velux  ${device.velux_type === 'window' ? 'Window' : 'Shutter'} ${device.id}`))

        // create handlers for required characteristics
        this.service.getCharacteristic(this.platform.Characteristic.CurrentPosition)
            .onGet(this.handleCurrentPositionGet.bind(this))

        this.service.getCharacteristic(this.platform.Characteristic.PositionState)
            .onGet(this.handlePositionStateGet.bind(this))

        this.service.getCharacteristic(this.platform.Characteristic.TargetPosition)
            .onGet(this.handleTargetPositionGet.bind(this))
            .onSet(this.handleTargetPositionSet.bind(this))
    }

    async getUpdatedState (id: string, delayTime = 2000) {
        await this.platform.retrieveDevicesStatus(delayTime)
        const state = this.platform.devices.find(f => f.id === id)
        return state ?? this.device
    }

    /**
     * Handle requests to get the current value of the "Current Position" characteristic
     */
    async handleCurrentPositionGet () {
        this.platform.log.debug('Triggered GET CurrentPosition')
        const veluxDevice = await this.getUpdatedState(this.device.id)
        return veluxDevice.current_position
    }

    /**
     * Handle requests to get the current value of the "Position State" characteristic
     */
    async handlePositionStateGet () {
        this.platform.log.debug('Triggered GET PositionState')
        const veluxDevice = await this.getUpdatedState(this.device.id)
        if (veluxDevice.current_position < veluxDevice.target_position) {
            return this.platform.Characteristic.PositionState.INCREASING
        } else if (veluxDevice.current_position > veluxDevice.target_position) {
            return this.platform.Characteristic.PositionState.DECREASING
        }
        return this.platform.Characteristic.PositionState.STOPPED
    }

    /**
     * Handle requests to get the current value of the "Target Position" characteristic
     */
    async handleTargetPositionGet () {
        this.platform.log.debug('Triggered GET TargetPosition')
        const veluxDevice = await this.getUpdatedState(this.device.id)
        return veluxDevice.target_position
    }

    /**
     * Handle requests to set the "Target Position" characteristic
     */
    handleTargetPositionSet (value) {
        if (value > 100 || value < 0) {
            this.platform.log.error('Invalid value for target position')
            return
        }

        this.platform.log.debug('Triggered SET TargetPosition:', value)
        try {
            this.platform.retrieveNewToken().then(async () => {
                const response = await fetch(this.platform.baseUrl + 'syncapi/v1/setstate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                        Authorization: `Bearer ${this.platform.apiToken}`
                    },
                    body: JSON.stringify({
                        home: {
                            id: this.platform.homeId,
                            modules: [
                                {
                                    bridge: this.device.bridge,
                                    id: this.device.id,
                                    target_position: value,
                                    nonce: 0,
                                    timestamp: new Date().getTime()
                                }
                            ]
                        }
                    })
                })
                const result = await response.json()

                this.platform.log.info(`Target position set to ${value}. Success: ${result.status}`)

                let veluxDevice: VeluxDevice
                do {
                    veluxDevice = await this.getUpdatedState(this.device.id, 500)
                    await this.platform.delay(1000)
                } while (veluxDevice.current_position !== veluxDevice.target_position)
            })
        } catch (e) {
            this.platform.log.error(`Could not set position for device: ${this.device.id}`, e)
        }
    }
}
