import {
    API,
    Characteristic,
    DynamicPlatformPlugin,
    Logger,
    PlatformAccessory,
    PlatformConfig,
    Service
} from 'homebridge'
import fetch from 'node-fetch'
import {PLATFORM_NAME, PLUGIN_NAME} from './settings'
import {VeluxAccessory} from './VeluxAccessory'
import {VeluxDevice} from './VeluxDevice'

export class VeluxActivePlatform implements DynamicPlatformPlugin {
    public readonly baseUrl: string = 'https://app.velux-active.com/'
    public readonly clientId: string = '5931426da127d981e76bdd3f' // clientId of the app - not personal
    public readonly clientSecret: string = '6ae2d89d15e767ae5c56b456b452d319' // clientSecret of the app - not personal
    public readonly Service: typeof Service = this.api.hap.Service
    public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic

    // this is used to track restored cached accessories
    public readonly accessories: PlatformAccessory[] = []

    public apiToken: string = ''
    public refreshToken: string = ''
    public homeId: string = ''
    public devices: VeluxDevice[] = []
    public lastTokenRefresh: Date | undefined = undefined
    public tokenWillExpire: Date | undefined = undefined
    public lastDeviceUpdate: Date | undefined = undefined

    private refreshing = false

    constructor (
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
    ) {
        this.log.debug('Finished initializing platform:', this.config.name)
        this.api.on('didFinishLaunching', async () => {
            log.debug('Executed didFinishLaunching callback')

            let success = false
            let retries = 0
            do {
                const retrievedApiKey = await this.retrieveApiKey(config.username, config.password)
                if (retrievedApiKey) {
                    const retrievedHome = await this.retrieveHomeId()
                    if (retrievedHome) {
                        success = await this.retrieveDevicesStatus()
                    }
                }
                await this.delay(5000)
                retries = retries + 1
            } while (!success && retries <= 3)
            this.log.info('Init complete, creating devices')
            this.createDevices()
        })
    }

    delay (ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    async setTokens (response: any) {
        const result = await response.json()
        this.apiToken = result.access_token
        this.refreshToken = result.refresh_token
        this.lastTokenRefresh = new Date()
        this.tokenWillExpire = new Date()
        this.tokenWillExpire.setSeconds(this.tokenWillExpire.getSeconds() + result.expires_in)
        this.log.info('Token will expire: ', this.tokenWillExpire)
    }

    configureAccessory (accessory: PlatformAccessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName)
        this.accessories.push(accessory)
    }

    async retrieveApiKey (username: string, password: string): Promise<boolean> {
        if (this.tokenWillExpire !== undefined && (this.tokenWillExpire?.getTime() - new Date().getTime()) > 0) {
            this.log.debug('Token still valid', new Date(), this.tokenWillExpire, (this.tokenWillExpire?.getTime() - new Date().getTime()) > 0)
            return true
        }

        this.log.debug('Getting new token')
        try {
            const encoded = encodeURIComponent(username)
            const response = await fetch(this.baseUrl + 'oauth2/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: `grant_type=password&client_id=${this.clientId}&client_secret=${this.clientSecret}&username=${encoded}&password=${password}&user_prefix=velux`

            })
            if (!response.ok) {
                this.log.error(`Could not retrieve api key. Status ${response.status}`)
                return false
            }

            await this.setTokens(response)
            this.log.info('Successfully retrieved api token')

            return true
        } catch (e) {
            this.log.error('Something went wrong while trying to retrieve api key', e)
            return false
        }
    }

    async retrieveNewToken () {
        if (this.tokenWillExpire !== undefined && (this.tokenWillExpire?.getTime() - new Date().getTime()) > 0) {
            this.log.debug('Token still valid', new Date(), this.tokenWillExpire, (this.tokenWillExpire?.getTime() - new Date().getTime()) > 0)
            return true
        }

        try {
            const response = await fetch(this.baseUrl + 'oauth2/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: `grant_type=refresh_token&refresh_token=${this.refreshToken}&client_id=${this.clientId}&client_secret=${this.clientSecret}`

            })
            await this.setTokens(response)
            this.log.info('Successfully refreshed token')

            return true
        } catch (e) {
            this.log.error('Could not refresh token')
            return false
        }
    }

    async retrieveHomeId () {
        try {
            const response = await fetch(this.baseUrl + 'api/gethomedata', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: `access_token=${this.apiToken}`

            })
            const result = await response.json()
            this.homeId = result.body.homes[0].id
            this.log.info('Successfully retrieved home id')

            return true
        } catch (e) {
            this.log.error('Could not retrieve home id')
            return false
        }
    }

    async retrieveDevicesStatus (delayTime = 2000) {
        if (this.refreshing) {
            this.log.debug('already refreshing state')
            await this.delay(500) // wait for the update
            return true
        }

        if (this.lastDeviceUpdate !== undefined && (new Date().getTime() - this.lastDeviceUpdate.getTime() < delayTime)) {
            this.log.debug('Using cached state as it is not older than 2s')
            return true
        }

        this.refreshing = true
        try {
            await this.retrieveNewToken()
            this.lastDeviceUpdate = new Date()
            const response = await fetch(this.baseUrl + 'api/homestatus', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: `access_token=${this.apiToken}&home_id=${this.homeId}`

            })
            const result = await response.json()
            this.log.debug('Got devices status', result)
            this.devices = result.body.home.modules.filter(m => m.type === 'NXO')

            this.log.debug('Successfully retrieved devices from velux')

            return true
        } catch (e) {
            this.log.error('Could not retrieve devices from velux', e)
            return false
        } finally {
            this.refreshing = false
        }
    }

    createDevices () {
        this.devices.forEach(d => {
            const uuid = this.api.hap.uuid.generate(d.id)
            const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

            if (existingAccessory) {
                this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName)

                // eslint-disable-next-line no-new
                new VeluxAccessory(this, existingAccessory, d)
            } else {
                this.log.info('Adding new accessory:', d.id)
                // eslint-disable-next-line new-cap
                const accessory = new this.api.platformAccessory(d.id, uuid)

                // eslint-disable-next-line no-new
                new VeluxAccessory(this, accessory, d)
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
            }
        })
    }
}
