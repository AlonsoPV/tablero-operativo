import { useEffect } from 'react'
import { applyLandingDocumentMeta, buildLandingJsonLd } from '@/lib/seo/documentMeta'
import {
  AGENT_LANDING_SEO,
  getAgentLandingCanonicalUrl,
  getAgentLandingOgImageUrl,
  getAgentLandingSectionUrl,
} from './agentSeo'
import { getLandingCanonicalUrl, LANDING_SEO } from '@/pages/product/landingSeo'

const JSON_LD_ID = 'scrumban-agent-landing-jsonld'

function buildJsonLd() {
  const url = getAgentLandingCanonicalUrl()
  return buildLandingJsonLd({
    siteName: AGENT_LANDING_SEO.siteName,
    productName: AGENT_LANDING_SEO.productName,
    title: AGENT_LANDING_SEO.title,
    description: AGENT_LANDING_SEO.description,
    url,
    relatedUrl: getLandingCanonicalUrl(),
    relatedName: LANDING_SEO.productName,
    organizationName: 'Scrumban',
    softwareName: AGENT_LANDING_SEO.productName,
    sections: Object.values(AGENT_LANDING_SEO.sections),
    sectionUrl: getAgentLandingSectionUrl,
    breadcrumbName: AGENT_LANDING_SEO.productName,
  })
}

/** Metadatos globales de la landing del agente (`<head>` + JSON-LD). */
export function AgentSeoHead() {
  useEffect(() => {
    return applyLandingDocumentMeta({
      title: AGENT_LANDING_SEO.title,
      description: AGENT_LANDING_SEO.description,
      keywords: AGENT_LANDING_SEO.keywords,
      canonical: getAgentLandingCanonicalUrl(),
      ogImage: getAgentLandingOgImageUrl(),
      ogImageAlt: AGENT_LANDING_SEO.ogImageAlt,
      jsonLdId: JSON_LD_ID,
      jsonLd: buildJsonLd(),
    })
  }, [])

  return null
}

/** Metadescripción accesible por sección. */
export function AgentSectionSeo({ description }: { description: string }) {
  return <p className="sr-only">{description}</p>
}
