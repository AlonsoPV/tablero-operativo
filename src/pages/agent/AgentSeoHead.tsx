import { useEffect } from 'react'
import {
  AGENT_LANDING_SEO,
  getAgentLandingCanonicalUrl,
  getAgentLandingSectionUrl,
} from './agentSeo'

const JSON_LD_ID = 'scrumban-agent-landing-jsonld'

function upsertMeta(selector: string, create: () => HTMLMetaElement, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector)
  if (!element) {
    element = create()
    document.head.appendChild(element)
  }
  element.content = content
}

function upsertLink(rel: string, href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!element) {
    element = document.createElement('link')
    element.rel = rel
    document.head.appendChild(element)
  }
  element.href = href
}

function buildJsonLd() {
  const url = getAgentLandingCanonicalUrl()
  const sections = Object.values(AGENT_LANDING_SEO.sections)

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: AGENT_LANDING_SEO.siteName,
        url,
        description: AGENT_LANDING_SEO.description,
      },
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: AGENT_LANDING_SEO.title,
        description: AGENT_LANDING_SEO.description,
        isPartOf: { '@id': `${url}#website` },
        about: {
          '@type': 'SoftwareApplication',
          name: `${AGENT_LANDING_SEO.siteName} Agente`,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          description: AGENT_LANDING_SEO.description,
        },
        hasPart: sections.map((section) => ({
          '@type': 'WebPageElement',
          name: section.name,
          description: section.description,
          url: getAgentLandingSectionUrl(section.id),
        })),
      },
    ],
  }
}

/** Metadatos globales de la landing del agente (`<head>` + JSON-LD). */
export function AgentSeoHead() {
  useEffect(() => {
    const previousTitle = document.title
    const canonical = getAgentLandingCanonicalUrl()

    document.title = AGENT_LANDING_SEO.title

    upsertMeta(
      'meta[name="description"]',
      () => {
        const meta = document.createElement('meta')
        meta.name = 'description'
        return meta
      },
      AGENT_LANDING_SEO.description
    )

    upsertMeta(
      'meta[name="keywords"]',
      () => {
        const meta = document.createElement('meta')
        meta.name = 'keywords'
        return meta
      },
      AGENT_LANDING_SEO.keywords
    )

    upsertMeta(
      'meta[property="og:title"]',
      () => {
        const meta = document.createElement('meta')
        meta.setAttribute('property', 'og:title')
        return meta
      },
      AGENT_LANDING_SEO.title
    )

    upsertMeta(
      'meta[property="og:description"]',
      () => {
        const meta = document.createElement('meta')
        meta.setAttribute('property', 'og:description')
        return meta
      },
      AGENT_LANDING_SEO.description
    )

    upsertMeta(
      'meta[property="og:type"]',
      () => {
        const meta = document.createElement('meta')
        meta.setAttribute('property', 'og:type')
        return meta
      },
      'website'
    )

    upsertMeta(
      'meta[property="og:url"]',
      () => {
        const meta = document.createElement('meta')
        meta.setAttribute('property', 'og:url')
        return meta
      },
      canonical
    )

    upsertMeta(
      'meta[name="twitter:card"]',
      () => {
        const meta = document.createElement('meta')
        meta.name = 'twitter:card'
        return meta
      },
      'summary_large_image'
    )

    upsertMeta(
      'meta[name="twitter:title"]',
      () => {
        const meta = document.createElement('meta')
        meta.name = 'twitter:title'
        return meta
      },
      AGENT_LANDING_SEO.title
    )

    upsertMeta(
      'meta[name="twitter:description"]',
      () => {
        const meta = document.createElement('meta')
        meta.name = 'twitter:description'
        return meta
      },
      AGENT_LANDING_SEO.description
    )

    upsertLink('canonical', canonical)

    let jsonLd = document.getElementById(JSON_LD_ID) as HTMLScriptElement | null
    if (!jsonLd) {
      jsonLd = document.createElement('script')
      jsonLd.id = JSON_LD_ID
      jsonLd.type = 'application/ld+json'
      document.head.appendChild(jsonLd)
    }
    jsonLd.textContent = JSON.stringify(buildJsonLd())

    return () => {
      document.title = previousTitle
    }
  }, [])

  return null
}

/** Metadescripción accesible por sección. */
export function AgentSectionSeo({ description }: { description: string }) {
  return <p className="sr-only">{description}</p>
}
