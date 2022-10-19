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
                        success = await this.retrieveDevices()
                    }
                }
                retries = retries + 1
            } while (!success && retries >= 3)
            this.createDevices()
        })
    }

    configureAccessory (accessory: PlatformAccessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName)
        this.accessories.push(accessory)
    }

    async retrieveApiKey (username: string, password: string): Promise<boolean> {
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

            const result = await response.json()
            this.apiToken = result.data.access_token
            this.refreshToken = result.data.refresh_token
            this.lastTokenRefresh = new Date()
            this.tokenWillExpire = new Date(this.lastTokenRefresh + result.data.expires_in)

            this.log.info('Successfully retrieved api token')

            return true
        } catch (e) {
            this.log.error('Something went wrong while trying to retrieve api key', e)
            return false
        }
    }

    async retrieveNewToken () {
        if (this.tokenWillExpire !== undefined && Math.abs(this.tokenWillExpire?.getTime() - new Date().getTime()) > 0) {
            this.log.debug('Token still valid')
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
            const result = await response.json()
            this.apiToken = result.data.access_token
            this.refreshToken = result.data.refresh_token
            this.lastTokenRefresh = new Date()
            this.tokenWillExpire = new Date(this.lastTokenRefresh + result.data.expires_in)

            this.log.debug('Successfully refreshed token')

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
            this.homeId = result.data.home.id
            this.log.info('Successfully retrieved home id')

            return true
        } catch (e) {
            this.log.error('Could not retrieve home id, retrying')
            return false
        }
    }

    async retrieveDevices () {
        try {
            await this.retrieveNewToken()
            const response = await fetch(this.baseUrl + 'api/homestatus', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: `access_token=${this.apiToken}&home_id=${this.homeId}`

            })
            const result = await response.json()
            this.devices = result.data.home.modules.filter(m => m.type === 'NXO')

            this.log.debug('Successfully retrieved devices from velux')

            return true
        } catch (e) {
            this.log.error('Could not retrieve devices from velux')
            return false
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
