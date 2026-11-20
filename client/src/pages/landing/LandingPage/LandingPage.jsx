import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import { LANDING_SECTION_TARGETS, useLandingPageData } from './hooks/useLandingPageData.js';
import LandingPageHeader from './components/LandingPageHeader.jsx';
import LandingMobileDrawer from './components/LandingMobileDrawer.jsx';
import LandingHero from './components/LandingHero.jsx';
import LandingPlatformStory from './components/LandingPlatformStory.jsx';
import LandingFeatures from './components/LandingFeatures.jsx';
import LandingHowItWorks from './components/LandingHowItWorks.jsx';
import LandingPricing from './components/LandingPricing.jsx';
import LandingFaq from './components/LandingFaq.jsx';
import LandingBookDemo from './components/LandingBookDemo.jsx';
import LandingFindSchool from './components/LandingFindSchool.jsx';
import LandingFooter from './components/LandingFooter.jsx';
import './LandingPage.css';

/**
 * Public landing page.
 *
 * Hero → Product workflows → Learning tools → School setup → Pricing → FAQ →
 * Demo enquiry → Footer. The page renders its static sections immediately and
 * loads only the public plan list in the background.
 */
export default function LandingPage() {
    const { t } = useTranslation(['landing.page']);
    const data = useLandingPageData();
    const { copy, appName } = data;

    useEffect(() => {
        const previousTitle = document.title;
        const existingDescription = document.querySelector('meta[name="description"]');
        const previousDescription = existingDescription ? existingDescription.getAttribute('content') : null;

        const descriptionTag = existingDescription || document.createElement('meta');
        if (!existingDescription) {
            descriptionTag.setAttribute('name', 'description');
            document.head.appendChild(descriptionTag);
        }

        document.title = t('publicPage.seo.title', { appName });
        descriptionTag.setAttribute('content', t('publicPage.seo.description', { appName }));

        return () => {
            document.title = previousTitle;
            if (existingDescription) {
                if (previousDescription !== null) {
                    descriptionTag.setAttribute('content', previousDescription);
                }
                return;
            }
            descriptionTag.remove();
        };
    }, [t, appName]);

    useEffect(() => {
        const hash = window.location.hash.replace(/^#/, '');
        if (!hash) return;
        const entry = Object.values(LANDING_SECTION_TARGETS).find((item) => item.sectionId === hash);
        if (!entry) return;
        const element = document.getElementById(entry.sectionId);
        if (!element) return;
        element.scrollIntoView({ behavior: 'auto', block: 'start' });
    }, []);

    const planOptions = data.plansState.plans.map((plan) => ({ key: plan.key, name: plan.name }));

    return (
        <Box
            className="landing-public"
            data-testid="landing-page"
            data-lang={data.language}
            data-dir={data.direction}
        >
            <a className="landing-public-skip-link" href="#landing-main">
                {copy.a11y?.skip}
            </a>

            <LandingPageHeader
                copy={copy}
                appName={appName}
                navItems={data.navItems}
                language={data.language}
                themeMode={data.themeMode}
                onOpenMenu={data.openMenu}
                onLanguageChange={data.switchLanguage}
                onToggleTheme={data.toggleTheme}
                onNavigateSection={data.navigateSection}
                onRequestDemo={() => data.navigateSection('demo')}
                onSignIn={data.navigateToSignIn}
            />

            <Box component="main" id="landing-main" tabIndex={-1} sx={{ outline: 'none' }}>
                <LandingHero
                    copy={copy}
                    onNavigateSection={data.navigateSection}
                    onSignIn={data.navigateToSignIn}
                />

                <LandingPlatformStory copy={copy} />

                <LandingFeatures copy={copy} />

                <LandingHowItWorks copy={copy} onRegister={data.navigateToRegister} />

                <LandingPricing
                    copy={copy}
                    plansState={data.plansState}
                    language={data.language}
                    demoStatus={data.demoStatus}
                    onRetry={data.retryPlans}
                    onSelectPlan={data.requestPlan}
                />

                <LandingFaq copy={copy} />

                <LandingBookDemo
                    copy={copy}
                    language={data.language}
                    planOptions={planOptions}
                    selectedPlanKey={data.selectedPlanKey}
                    planNotice={data.planNotice}
                    onPlanChange={data.selectPlan}
                    onClearPlan={data.clearPlan}
                    onStatusChange={data.setDemoStatus}
                    onOpenFinder={(event) => data.openFinder(event.currentTarget)}
                />
            </Box>

            <LandingFooter
                copy={copy}
                appName={appName}
                year={new Date().getFullYear()}
                navItems={data.navItems}
                onNavigateSection={data.navigateSection}
                onOpenFinder={(event) => data.openFinder(event.currentTarget)}
                onSignIn={data.navigateToSignIn}
            />

            <LandingMobileDrawer
                copy={copy}
                direction={data.direction}
                open={data.mobileOpen}
                navItems={data.navItems}
                language={data.language}
                themeMode={data.themeMode}
                onClose={() => data.closeMobileDrawer()}
                onExited={data.handleDrawerClosed}
                onNavigateSection={data.navigateFromDrawer}
                onOpenFinder={data.openFinderFromDrawer}
                onLanguageChange={data.switchLanguage}
                onToggleTheme={data.toggleTheme}
                onSignIn={data.navigateToSignIn}
            />

            <LandingFindSchool
                copy={copy}
                open={data.finderOpen}
                query={data.finderQuery}
                state={data.finderState}
                onQueryChange={data.setFinderQuery}
                onRetry={data.retryFinder}
                onClose={data.closeFinder}
            />
        </Box>
    );
}
