/** Helpers DOM para metadatos SEO en landings y rutas noindex. */

export function upsertNamedMeta(name: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.name = name
    document.head.appendChild(element)
  }
  element.content = content
}

export function upsertPropertyMeta(property: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute('property', property)
    document.head.appendChild(element)
  }
  element.content = content
}

export function upsertLink(rel: string, href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!element) {
    element = document.createElement('link')
    element.rel = rel
    document.head.appendChild(element)
  }
  element.href = href
}

export function removeLink(rel: string) {
  document.head.querySelectorAll(`link[rel="${rel}"]`).forEach((node) => node.remove())
}

export function setJsonLd(id: string, data: unknown) {
  let script = document.getElementById(id) as HTMLScriptElement | null
  if (!script) {
    script = document.createElement('script')
    script.id = id
    script.type = 'application/ld+json'
    document.head.appendChild(script)
  }
  script.textContent = JSON.stringify(data)
}

export function removeJsonLd(id: string) {
  document.getElementById(id)?.remove()
}

export function setDocumentLang(lang: string) {
  document.documentElement.lang = lang
}

export type LandingDocumentMetaInput = {
  title: string
  description: string
  keywords: string
  canonical: string
  robots?: string
  ogType?: string
  ogImage: string
  ogImageAlt: string
  ogLocale?: string
  twitterCard?: string
  jsonLdId: string
  jsonLd: unknown
}

/** Aplica metadatos de landing comercial y retorna cleanup parcial (title + json-ld). */
export function applyLandingDocumentMeta(input: LandingDocumentMetaInput) {
  const previousTitle = document.title
  const previousLang = document.documentElement.lang

  document.title = input.title
  setDocumentLang('es-MX')

  upsertNamedMeta('description', input.description)
  upsertNamedMeta('keywords', input.keywords)
  upsertNamedMeta('robots', input.robots ?? 'index,follow')

  upsertPropertyMeta('og:title', input.title)
  upsertPropertyMeta('og:description', input.description)
  upsertPropertyMeta('og:type', input.ogType ?? 'website')
  upsertPropertyMeta('og:url', input.canonical)
  upsertPropertyMeta('og:image', input.ogImage)
  upsertPropertyMeta('og:image:alt', input.ogImageAlt)
  upsertPropertyMeta('og:image:width', '1200')
  upsertPropertyMeta('og:image:height', '630')
  upsertPropertyMeta('og:locale', input.ogLocale ?? 'es_MX')

  upsertNamedMeta('twitter:card', input.twitterCard ?? 'summary_large_image')
  upsertNamedMeta('twitter:title', input.title)
  upsertNamedMeta('twitter:description', input.description)
  upsertNamedMeta('twitter:image', input.ogImage)

  upsertLink('canonical', input.canonical)
  setJsonLd(input.jsonLdId, input.jsonLd)

  return () => {
    document.title = previousTitle
    document.documentElement.lang = previousLang || 'es-MX'
    removeJsonLd(input.jsonLdId)
  }
}

/** Marca la ruta actual como no indexable (app / auth). */
export function applyNoIndexDocumentMeta(title?: string) {
  const previousTitle = document.title
  if (title) document.title = title
  upsertNamedMeta('robots', 'noindex,nofollow')
  removeLink('canonical')
  return () => {
    document.title = previousTitle
  }
}

export type LandingJsonLdSection = {
  id: string
  name: string
  description: string
}

export type LandingJsonLdInput = {
  siteName: string
  productName: string
  title: string
  description: string
  url: string
  relatedUrl: string
  relatedName: string
  organizationName: string
  softwareName: string
  sections: LandingJsonLdSection[]
  sectionUrl: (sectionId: string) => string
  breadcrumbName: string
}

export function buildLandingJsonLd(input: LandingJsonLdInput) {
  const websiteId = `${input.url}#website`
  const webpageId = `${input.url}#webpage`
  const orgId = `${input.url}#organization`
  const appId = `${input.url}#software`

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': orgId,
        name: input.organizationName,
        url: input.url,
      },
      {
        '@type': 'WebSite',
        '@id': websiteId,
        name: input.siteName,
        url: input.url,
        description: input.description,
        publisher: { '@id': orgId },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': appId,
        name: input.softwareName,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: input.description,
        url: input.url,
        provider: { '@id': orgId },
      },
      {
        '@type': 'WebPage',
        '@id': webpageId,
        url: input.url,
        name: input.title,
        description: input.description,
        isPartOf: { '@id': websiteId },
        about: { '@id': appId },
        relatedLink: input.relatedUrl,
        mentions: {
          '@type': 'SoftwareApplication',
          name: input.relatedName,
          url: input.relatedUrl,
        },
        hasPart: input.sections.map((section) => ({
          '@type': 'WebPageElement',
          name: section.name,
          description: section.description,
          url: input.sectionUrl(section.id),
        })),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${input.url}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: input.organizationName,
            item: input.url.replace(/\/(?:producto|agente)\/?$/, '') || input.url,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: input.breadcrumbName,
            item: input.url,
          },
        ],
      },
    ],
  }
}
