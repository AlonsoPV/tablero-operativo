import { useEffect } from 'react'
import { applyLandingDocumentMeta, buildLandingJsonLd } from '@/lib/seo/documentMeta'
import {
  getLandingCanonicalUrl,
  getLandingOgImageUrl,
  getLandingSectionUrl,
  LANDING_SEO,
} from './landingSeo'
import { AGENT_LANDING_SEO, getAgentLandingCanonicalUrl } from '@/pages/agent/agentSeo'

const JSON_LD_ID = 'scrumban-landing-jsonld'

function buildJsonLd() {
  const url = getLandingCanonicalUrl()
  return buildLandingJsonLd({
    siteName: LANDING_SEO.siteName,
    productName: LANDING_SEO.productName,
    title: LANDING_SEO.title,
    description: LANDING_SEO.description,
    url,
    relatedUrl: getAgentLandingCanonicalUrl(),
    relatedName: AGENT_LANDING_SEO.productName,
    organizationName: 'Scrumban',
    softwareName: LANDING_SEO.productName,
    sections: Object.values(LANDING_SEO.sections),
    sectionUrl: getLandingSectionUrl,
    breadcrumbName: LANDING_SEO.productName,
  })
}

/** Metadatos globales de la landing (`<head>` + JSON-LD por sección). */
export function LandingSeoHead() {
  useEffect(() => {
    return applyLandingDocumentMeta({
      title: LANDING_SEO.title,
      description: LANDING_SEO.description,
      keywords: LANDING_SEO.keywords,
      canonical: getLandingCanonicalUrl(),
      ogImage: getLandingOgImageUrl(),
      ogImageAlt: LANDING_SEO.ogImageAlt,
      jsonLdId: JSON_LD_ID,
      jsonLd: buildJsonLd(),
    })
  }, [])

  return null
}

/** Metadescripción accesible por sección (complementa el JSON-LD). */
export function LandingSectionSeo({ description }: { description: string }) {
  return <p className="sr-only">{description}</p>
}
