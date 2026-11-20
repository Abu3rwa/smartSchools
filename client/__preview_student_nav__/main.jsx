import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import i18n from '../src/i18n';
import StudentDashboardPage from '../src/pages/student/dashboard/StudentDashboardPage/StudentDashboardPage';
import StudentSkillPathPage from '../src/pages/student/skillpath/StudentSkillPathPage';
import '../src/index.css';

const params = new URLSearchParams(location.search);
const width = params.get('width');
if (width) {
  params.delete('width');
  const iframe = document.createElement('iframe');
  iframe.width = width;
  iframe.height = '2200';
  iframe.src = `${location.pathname}?${params}`;
  document.getElementById('root').replaceWith(iframe);
} else {
  const language = params.get('lang') || 'en';
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.dataset.theme = params.get('theme') || 'light';
  await i18n.changeLanguage(language);
  await i18n.loadNamespaces(['layout.sidebar', 'skillpath']);
  const features = params.has('locked') ? { socialStudies: false, mapTestPrep: false, readingAssistant: false, writingAssistant: false, studentAiTutor: false } : {};
  const store = configureStore({ reducer: () => ({ auth: { user: { role: 'student', firstName: 'Demo' } }, schoolFeatures: { features } }) });
  function RouteProbe() {
    const location = useLocation();
    return <output id="route-probe" hidden>{location.pathname}</output>;
  }
  createRoot(document.getElementById('root')).render(
    <Provider store={store}><MemoryRouter initialEntries={['/portal/dashboard']}>
      <RouteProbe />
      <Routes>
        <Route path="/portal/dashboard" element={<StudentDashboardPage />} />
        <Route path="/portal/skillpath" element={<StudentSkillPathPage />} />
      </Routes>
    </MemoryRouter></Provider>
  );
}
