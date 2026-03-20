/**
 * Astro serializes island props as JSON with tagged tuples: [0, value] or [1, array].
 */
export function astroUnwrap(value: unknown): unknown {
    if (value === null || value === undefined) {
        return value
    }
    if (Array.isArray(value)) {
        if (value.length === 2 && typeof value[0] === 'number') {
            const [tag, payload] = value as [number, unknown]
            if (tag === 0) {
                return astroUnwrap(payload)
            }
            if (tag === 1 && Array.isArray(payload)) {
                return payload.map((x) => astroUnwrap(x))
            }
        }
        return value
    }
    if (typeof value === 'object') {
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(value as object)) {
            out[k] = astroUnwrap(v)
        }
        return out
    }
    return value
}

export function readAstroIslandProps($: CheerioPropsRoot, prefix: string): string | undefined {
    return $(`astro-island[prefix="${prefix}"]`).first().attr('props')
}

export function parseAstroPropsJson(rawProps: string, errorLabel: string): unknown {
    try {
        return JSON.parse(rawProps)
    } catch {
        throw new Error(`Failed to ${errorLabel} (invalid props JSON)`)
    }
}

export function parseAndUnwrapAstroProps<T>(rawProps: string, errorLabel: string): T {
    return astroUnwrap(parseAstroPropsJson(rawProps, errorLabel)) as T
}

/** Read `props` from the first matching island, parse JSON, and {@link astroUnwrap}. */
export function parseAstroIsland<T>($: CheerioPropsRoot, prefix: string, errorLabel: string): T {
    const rawProps = readAstroIslandProps($, prefix)
    if (rawProps == null || rawProps === '') {
        throw new Error(`Failed to ${errorLabel} (no astro island props)`)
    }
    return parseAndUnwrapAstroProps<T>(rawProps, errorLabel)
}
