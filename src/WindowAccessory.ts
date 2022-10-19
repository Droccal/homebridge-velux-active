import {PlatformAccessory, Service} from 'homebridge'

import {VeluxActivePlatform} from './platform'
import {VeluxDevice} from './VeluxDevice'
import fetch from 'node-fetch'

export class WindowAccessory {
    private service: Service

    constructor (
      private readonly platform: VeluxActivePlatform,
      private readonly accessory: PlatformAccessory,
      private readonly device: VeluxDevice
    ) {
        this.platform.log.info('Initializing Velux Window')
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, device.manufacturer)
            .setCharacteristic(this.platform.Characteristic.Model, device.velux_type)
            .setCharacteristic(this.platform.Characteristic.SerialNumber, device.id)

        // create a new Window Covering service
        this.service = this.accessory.getService(this.platform.Service.Window) || this.accessory.addService(this.platform.Service.Window)

        // create handlers for required characteristics
        this.service.getCharacteristic(this.platform.Characteristic.CurrentPosition)
            .onGet(this.handleCurrentPositionGet.bind(this))

        this.service.getCharacteristic(this.platform.Characteristic.PositionState)
            .onGet(this.handlePositionStateGet.bind(this))

        this.service.getCharacteristic(this.platform.Characteristic.TargetPosition)
            .onGet(this.handleTargetPositionGet.bind(this))
            .onSet(this.handleTargetPositionSet.bind(this))
    }

    /**
     * Handle requests to get the current value of the "Current Position" characteristic
     */
    handleCurrentPositionGet () {
        this.platform.log.debug('Triggered GET CurrentPosition')
        return this.device.current_position
    }

    /**
     * Handle requests to get the current value of the "Position State" characteristic
     */
    handlePositionStateGet () {
        this.platform.log.debug('Triggered GET PositionState')
        return this.platform.Characteristic.PositionState.STOPPED
    }

    /**
     * Handle requests to get the current value of the "Target Position" characteristic
     */
    handleTargetPositionGet () {
        this.platform.log.debug('Triggered GET TargetPosition')
        return this.device.target_position
    }

    /**
     * Handle requests to set the "Target Position" characteristic
     */
    async handleTargetPositionSet (value) {
        this.platform.log.debug('Triggered SET TargetPosition:', value)
        try {
            await this.platform.retrieveNewToken()
            const response = await fetch(this.platform.baseUrl + '/syncapi/v1/setstate', {
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
                                target_position: value
                            }
                        ]
                    }
                })
            })
            const result = await response.json()

            this.platform.log.debug(`Target position set. Success: ${result.data.status}`)
        } catch (e) {
            this.platform.log.error(`Could not set position for device: ${this.device.id}`, e)
        }
    }
}
