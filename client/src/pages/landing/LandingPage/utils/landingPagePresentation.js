import { resolveLandingTemplate } from '../../../../config/landingPageDefaults.js';

/**
 * Presentation helpers for landing page. Use resolveLandingTemplate from config.
 */

export function getHeroBadge(content, schoolCount) {
    return schoolCount > 0
        ? resolveLandingTemplate(content.hero.badgeTemplate, { schoolCount })
        : content.hero.badgeFallback;
}

export function getTrustItems(content, schoolCount) {
    return (content.trustStrip || [])
        .map((item) => ({
            ...item,
            text: resolveLandingTemplate(item.text, { schoolCount }),
        }))
        .filter((item) => Boolean(item.text));
}

export function getNoMatchMessage(content, searchTerm) {
    return resolveLandingTemplate(content.findSchool.noMatchTemplate, { searchTerm });
}

export function getMatchingLabel(content, searchTerm) {
    return resolveLandingTemplate(content.findSchool.matchingLabelTemplate, { searchTerm });
}

export function getShowingLimitText(content, shownCount, totalCount) {
    return resolveLandingTemplate(content.findSchool.showingLimitTemplate, {
        shownCount,
        totalCount,
    });
}

export function getCopyrightText(content) {
    return resolveLandingTemplate(content.footer.copyrightTemplate, {
        year: new Date().getFullYear(),
        copyrightName: content.brand.copyrightName,
    });
}
