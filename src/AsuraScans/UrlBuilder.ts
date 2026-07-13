type QueryParameter = string | string[] | undefined

interface BuildUrlOptions {
    addTrailingSlash?: boolean
}

export class URLBuilder {
    private readonly parameters: Record<string, QueryParameter> = {}
    private readonly pathComponents: string[] = []
    private readonly baseUrl: string

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/$/, '')
    }

    addPathComponent(component: string): URLBuilder {
        this.pathComponents.push(component.replace(/^\/+|\/+$/g, ''))
        return this
    }

    addQueryParameter(key: string, value: QueryParameter): URLBuilder {
        if (value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0)) {
            this.parameters[key] = value
        }
        return this
    }

    buildUrl(options: BuildUrlOptions = {}): string {
        const path = this.pathComponents.filter(Boolean).join('/')
        const trailingSlash = options.addTrailingSlash ? '/' : ''
        const query = Object.entries(this.parameters)
            .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : value}`)
            .join('&')

        const queryPrefix = query ? '?' : ''

        return `${this.baseUrl}/${path}${trailingSlash}${queryPrefix}${query}`
    }
}
