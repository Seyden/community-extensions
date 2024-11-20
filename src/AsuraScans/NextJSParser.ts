export class NextJSParser {
    private rawContent: string
    private mappedData: Map<string, string>
    private propertyToKeyCache: Map<string, string>
    constructor($: CheerioStatic, rememberKeyForProperties: string[] | null = null) {
        this.mappedData = new Map()
        this.propertyToKeyCache = new Map()
        this.rawContent = ''
        this.parseNextJSData($, rememberKeyForProperties)
    }

    private parseNextJSData($: CheerioStatic, rememberKeyForProperties: string[] | null) {
        const scriptsWithData = $('script')
            .toArray()
            .filter((script) => {
                const scriptContent = $(script).html()
                return scriptContent?.includes('self.__next_f.push')
            })
        if (scriptsWithData.length === 0) {
            throw new Error('Could not find script with data')
        }

        for (const scriptWithData of scriptsWithData) {
            const self = {
                __next_f: []
            }

            const scriptContent = $(scriptWithData).html()
            if (!scriptContent) continue
            eval(scriptContent)
            self.__next_f.forEach((val: [number, undefined | null | string]) => {
                if (val[0] === 1) {
                    this.rawContent += val[1] as unknown as string
                }
            })
        }

        const processedProperties: Map<string, boolean> = new Map()

        this.rawContent.split('\n').forEach((data) => {
            const splitIndex = data.indexOf(':')
            if (splitIndex === -1) {
                return
            }

            const key = data.slice(0, splitIndex)
            const value = data.slice(splitIndex + 1)

            if (rememberKeyForProperties?.length && processedProperties.size != rememberKeyForProperties.length) {
                for (const propertyToCache of rememberKeyForProperties) {
                    if (!processedProperties.get(propertyToCache)) {
                        if (value.indexOf(`${propertyToCache}`) > -1) {
                            this.propertyToKeyCache.set(propertyToCache, key)
                        }
                    }
                }
            }

            this.mappedData.set(key, value)
        })
    }

    public getKeyForProperty(propertyName: string): string | null {
        return this.propertyToKeyCache.get(propertyName) ?? null
    }

    public getReferenceKeyForProperty(propertyName: string): string | null {
        const pointerRegex = new RegExp(`"${propertyName}":"\\\$([0-9a-fA-F]+)"`, 'm')
        const match = this.rawContent.match(pointerRegex)
        return match?.[1] ?? null
    }

    public get(key: string): string | null {
        return this.mappedData.get(key) ?? null
    }

    private replacePointers(text: string): string {
        const pointerRegex = /\$[0-9a-fA-F]+/g
        let json: any
        try {
            json = JSON.parse(text)
        } catch (error) {}
        if (json) {
            return JSON.stringify(json, (key, value) => {
                if (typeof value === 'string') {
                    return this.replacePointers(value)
                }
                return value
            })
        }
        return text.replace(pointerRegex, (match) => {
            const key = match.slice(1)
            const value = this.get(key)
            if (value?.match(pointerRegex)) {
                return this.replacePointers(value)
            }
            return value ?? match
        })
    }

    public getObjectByKey(key: string): any {
        const bufferEntry = this.mappedData.get(key)
        if (bufferEntry === undefined) {
            throw new Error(`Key ${key} not found`)
        }
        const endResult = this.replacePointers(bufferEntry)
        return this.recurseParseJSON(endResult)
    }

    private recurseParseJSON(value: string | object): string | object {
        if (typeof value === 'string') {
            try {
                const json = JSON.parse(value)
                return this.recurseParseJSON(json)
            } catch (error) {
                return value
            }
        } else if (typeof value === 'object') {
            for (const key in value) {
                ;(value as { [key: string]: any })[key] = this.recurseParseJSON(
                    (value as { [key: string]: any })[key]
                )
            }
        } else if (Array.isArray(value)) {
            ;(value as []).forEach((element, index) => {
                ;(value as any[])[index] = this.recurseParseJSON(element)
            })
        }
        return value
    }
}