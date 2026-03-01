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
import LandingTrustStrip from './components/LandingTrustStrip.jsx';
import LandingHowItWorks from './components/LandingHowItWorks.jsx';
import LandingFeatures from './components/LandingFeatures.jsx';
import LandingPricing from './components/LandingPricing.jsx';
import LandingTestimonials from './components/LandingTestimonials.jsx';
import LandingFaq from './components/LandingFaq.jsx';
import LandingCta from './components/LandingCta.jsx';
import LandingFindSchool from './components/LandingFindSchool.jsx';
import LandingFooter from './components/LandingFooter.jsx';
import RevealOnScroll from './components/RevealOnScroll.jsx';
import './LandingPage.css';

/**
 * Public landing page. Composes data from useLandingPageData and section components.
 * Preserves routes, API calls, Redux, theme toggle, school search, scroll-to-section, handleAction, SEO JSON-LD.
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
        <Box sx={{ minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
            <div className="landing-bg-gradient" aria-hidden="true" />
            <div className="bg-grid" aria-hidden="true" />

            <LandingPageHeader
                content={content}
                themeMode={themeMode}
                toggleTheme={toggleTheme}
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
                scrollTo={scrollTo}
                handleAction={handleAction}
            />

            <LandingHero content={content} contentError={contentError} heroBadge={heroBadge} handleAction={handleAction} />
            
            <RevealOnScroll delay={0.2} duration={0.8}>
                <LandingTrustStrip trustItems={trustItems} />
            </RevealOnScroll>
            
            <RevealOnScroll>
                <LandingHowItWorks content={content} />
            </RevealOnScroll>
            
            <RevealOnScroll>
                <LandingFeatures content={content} />
            </RevealOnScroll>
            
            <RevealOnScroll>
                <LandingPricing content={content} handleAction={handleAction} />
            </RevealOnScroll>
            
            <RevealOnScroll>
                <LandingTestimonials content={content} />
            </RevealOnScroll>
            
            <RevealOnScroll>
                <LandingFaq content={content} />
            </RevealOnScroll>
            
            <RevealOnScroll>
                <LandingCta content={content} handleAction={handleAction} />
            </RevealOnScroll>
            
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
            
            <LandingFooter content={content} copyrightText={copyrightText} handleAction={handleAction} />
        </Box>
    );
}

