import Box from '@mui/material/Box';
import { useLandingPageData } from './hooks/useLandingPageData.js';
import {
    getHeroBadge,
    getTrustItems,
    getNoMatchMessage,
    getMatchingLabel,
    getShowingLimitText,
    getCopyrightText,
} from './utils/landingPagePresentation.js';
import LandingPageHeader from './components/LandingPageHeader.jsx';
import LandingMobileDrawer from './components/LandingMobileDrawer.jsx';
import LandingLoadingState from './components/LandingLoadingState.jsx';
import LandingHero from './components/LandingHero.jsx';
import LandingDynamicBlocks from './components/LandingDynamicBlocks.jsx';
import LandingTrustStrip from './components/LandingTrustStrip.jsx';
import LandingBenefits from './components/LandingBenefits.jsx';
import LandingFeatures from './components/LandingFeatures.jsx';
import LandingScreenshots from './components/LandingScreenshots.jsx';
import LandingHowItWorks from './components/LandingHowItWorks.jsx';
import LandingPricing from './components/LandingPricing.jsx';
import LandingTestimonials from './components/LandingTestimonials.jsx';
import LandingFaq from './components/LandingFaq.jsx';
import LandingCta from './components/LandingCta.jsx';
import LandingFindSchool from './components/LandingFindSchool.jsx';
import LandingFooter from './components/LandingFooter.jsx';
import RevealOnScroll from './components/RevealOnScroll.jsx';
import './LandingPage.css';

/**
 * Public landing page — modern SaaS layout.
 * Section order:
 *   Hero → Trust → Benefits → Features → Screenshots → How it Works →
 *   Pricing → Testimonials → FAQ → CTA → Find School → Footer
 */
export default function LandingPage() {
    const {
        content,
        contentError,
        contentLoading,
        loading,
        schools,
        schoolsToShow,
        filtered,
        hasSearchFilter,
        searchTerm,
        setSearchTerm,
        mobileOpen,
        setMobileOpen,
        themeMode,
        toggleTheme,
        switchLanguage,
        language,
        direction,
        uiText,
        dynamicBlocks,
        dynamicLoading,
        scrollTo,
        handleAction,
        navigate,
        totalSchoolCountLabel,
        filteredSchoolCountLabel,
    } = useLandingPageData();

    if (loading || contentLoading) {
        return <LandingLoadingState content={content} />;
    }

    const heroBadge = getHeroBadge(content, schools.length);
    const trustItems = getTrustItems(content, schools.length);
    const noMatchMessage = getNoMatchMessage(content, searchTerm);
    const matchingLabel = getMatchingLabel(content, searchTerm);
    const showingLimitText = getShowingLimitText(content, schoolsToShow.length, filtered.length);
    const copyrightText = getCopyrightText(content);

    return (
        <Box sx={{ minHeight: '100vh', position: 'relative', overflow: 'hidden' }} data-testid="landing-page" data-lang={language} data-dir={direction}>
            <div className="landing-bg-gradient" aria-hidden="true" />
            <div className="bg-grid" aria-hidden="true" />

            <LandingPageHeader
                content={content}
                themeMode={themeMode}
                toggleTheme={toggleTheme}
                language={language}
                onLanguageChange={switchLanguage}
                uiText={uiText}
                scrollTo={scrollTo}
                handleAction={handleAction}
                onOpenMobileMenu={() => setMobileOpen(true)}
            />
            <LandingMobileDrawer
                open={mobileOpen}
                onClose={() => setMobileOpen(false)}
                content={content}
                themeMode={themeMode}
                toggleTheme={toggleTheme}
                language={language}
                isRtl={direction === 'rtl'}
                onLanguageChange={switchLanguage}
                uiText={uiText}
                scrollTo={scrollTo}
                handleAction={handleAction}
            />

            {/* 1. Hero */}
            <LandingHero content={content} contentError={contentError} heroBadge={heroBadge} handleAction={handleAction} />

            {/* 2. Dynamic CMS Blocks (if any) */}
            <LandingDynamicBlocks
                blocks={dynamicBlocks}
                loading={dynamicLoading}
                fallbackUsed={Boolean(dynamicBlocks?.fallbackUsed)}
                fallbackNotice={uiText.dynamicFallbackNotice}
                onAction={handleAction}
            />

            {/* 3. Trust Strip */}
            <RevealOnScroll delay={0.1} duration={0.6}>
                <LandingTrustStrip trustItems={trustItems} />
            </RevealOnScroll>

            {/* 4. Benefits — WHY use us */}
            <RevealOnScroll>
                <LandingBenefits />
            </RevealOnScroll>

            {/* 5. Features — WHAT we offer (from CMS) */}
            <RevealOnScroll>
                <LandingFeatures content={content} />
            </RevealOnScroll>

            {/* 6. Screenshots — SEE the product */}
            <RevealOnScroll>
                <LandingScreenshots />
            </RevealOnScroll>

            {/* 7. How It Works — simple 3 steps */}
            <RevealOnScroll>
                <LandingHowItWorks content={content} />
            </RevealOnScroll>

            {/* 8. Pricing */}
            <RevealOnScroll>
                <LandingPricing content={content} handleAction={handleAction} />
            </RevealOnScroll>

            {/* 9. Testimonials */}
            <RevealOnScroll>
                <LandingTestimonials content={content} />
            </RevealOnScroll>

            {/* 10. FAQ */}
            <RevealOnScroll>
                <LandingFaq content={content} />
            </RevealOnScroll>

            {/* 11. Final CTA */}
            <RevealOnScroll>
                <LandingCta content={content} handleAction={handleAction} />
            </RevealOnScroll>

            {/* 12. Find School */}
            <RevealOnScroll>
                <LandingFindSchool
                    content={content}
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    hasSearchFilter={hasSearchFilter}
                    filtered={filtered}
                    schoolsToShow={schoolsToShow}
                    noMatchMessage={noMatchMessage}
                    matchingLabel={matchingLabel}
                    showingLimitText={showingLimitText}
                    totalSchoolCountLabel={totalSchoolCountLabel}
                    filteredSchoolCountLabel={filteredSchoolCountLabel}
                    handleAction={handleAction}
                    navigate={navigate}
                />
            </RevealOnScroll>

            {/* 13. Footer */}
            <LandingFooter content={content} copyrightText={copyrightText} handleAction={handleAction} />
        </Box>
    );
}
