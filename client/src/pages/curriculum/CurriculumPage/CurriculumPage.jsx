import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { selectUser } from '../../../store/slices/authSlice';
import { PERMISSIONS } from '../../../constants/permissions';
import curriculumService from '../../../services/curriculumService';
import CurriculumMapListPanel from './components/CurriculumMapListPanel';
import CurriculumMapEditorPanel from './components/CurriculumMapEditorPanel';
import CurriculumMapDetailPanel from './components/CurriculumMapDetailPanel';
import CurriculumSettingsPanel from './components/CurriculumSettingsPanel';
import {
  createEmptyMapDraft,
  filterMaps,
  toEditorDraftFromMap,
  toMapPayloadFromDraft,
} from './utils/curriculumPresentation';
import './CurriculumPage.css';

const DEFAULT_GUIDE_FORM = {
  mapId: '',
  classId: '',
  term: '',
  title: '',
};

const DEFAULT_OVERRIDE_FORM = {
  pacingGuideId: '',
  pacingEntryId: '',
  weekNumber: 1,
  reason: '',
  focus: '',
  objectives: '',
  assessment: '',
  notes: '',
};

const hasAnyPermission = (permissions = [], keys = []) => keys.some((key) => permissions.includes(key));

const CurriculumPage = () => {
  const { t } = useTranslation(['curriculum']);
  const user = useSelector(selectUser);
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  const isAdminLike = ['admin', 'department_principal'].includes(user?.role);
  const isTeacher = user?.role === 'teacher';

  const canEditMap = isAdminLike || hasAnyPermission(permissions, [
    PERMISSIONS.EDIT_CURRICULUM_MAPS,
    PERMISSIONS.CREATE_CURRICULUM_MAP,
    PERMISSIONS.EDIT_OWN_CURRICULUM_MAP,
    PERMISSIONS.EDIT_ANY_CURRICULUM_MAP,
  ]) || isTeacher;
  const canReviewMap = isAdminLike || hasAnyPermission(permissions, [
    PERMISSIONS.REVIEW_CURRICULUM_MAPS,
    PERMISSIONS.REVIEW_CURRICULUM_MAP,
    PERMISSIONS.APPROVE_CURRICULUM_MAP,
    PERMISSIONS.REJECT_CURRICULUM_MAP,
  ]);
  const canManageMap = isAdminLike || hasAnyPermission(permissions, [
    PERMISSIONS.EDIT_CURRICULUM_MAPS,
    PERMISSIONS.REVIEW_CURRICULUM_MAPS,
    PERMISSIONS.PUBLISH_CURRICULUM_MAPS,
    PERMISSIONS.EDIT_ANY_CURRICULUM_MAP,
    PERMISSIONS.CONFIGURE_CURRICULUM_MAP_TEMPLATES,
  ]);
  const canDeleteMap = canManageMap;
  const canPublishMap = isAdminLike || hasAnyPermission(permissions, [
    PERMISSIONS.PUBLISH_CURRICULUM_MAPS,
    PERMISSIONS.APPROVE_CURRICULUM_MAP,
  ]);
  const canEditGuide = isAdminLike || permissions.includes(PERMISSIONS.EDIT_PACING_GUIDES);
  const canApproveOverride = isAdminLike || permissions.includes(PERMISSIONS.APPROVE_PACING_OVERRIDES);
  const canManageSettings = isAdminLike || hasAnyPermission(permissions, [
    PERMISSIONS.MANAGE_SCHOOL_SETTINGS,
    PERMISSIONS.CONFIGURE_CURRICULUM_MAP_TEMPLATES,
  ]);

  const [activeTab, setActiveTab] = useState('maps');
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [maps, setMaps] = useState([]);
  const [mapHistory, setMapHistory] = useState(null);
  const [guides, setGuides] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [classSubjectPairs, setClassSubjectPairs] = useState([]);
  const [selectedMapId, setSelectedMapId] = useState('');
  const [mapFilters, setMapFilters] = useState({
    search: '',
    status: '',
    academicYear: '',
  });
  const [editorState, setEditorState] = useState({ mode: 'view', draft: null });
  const [savingMap, setSavingMap] = useState(false);
  const [transitionLoading, setTransitionLoading] = useState(false);
  const [importState, setImportState] = useState({ sources: [], jobs: [] });
  const [importLoading, setImportLoading] = useState(false);
  const [googleDriveStatus, setGoogleDriveStatus] = useState({ connected: false });
  const [guideForm, setGuideForm] = useState(DEFAULT_GUIDE_FORM);
  const [overrideForm, setOverrideForm] = useState(DEFAULT_OVERRIDE_FORM);
  const [settings, setSettings] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const userAcademicYear = user?.school?.settings?.currentAcademicYear || '';

  const selectedMap = useMemo(
    () => maps.find((map) => map._id === selectedMapId) || null,
    [maps, selectedMapId]
  );

  const activeTemplate = useMemo(() => {
    if (!settings?.templates) return null;
    return settings.templates.find((template) => template.key === settings.activeTemplateKey) || settings.templates[0] || null;
  }, [settings]);

  const filteredMaps = useMemo(() => filterMaps(maps, mapFilters), [maps, mapFilters]);

  const refreshMaps = useCallback(async () => {
    const mapsData = await curriculumService.listMaps({ limit: 100 });
    const nextMaps = mapsData?.items || [];
    setMaps(nextMaps);
    setSelectedMapId((previousMapId) => {
      if (!nextMaps.length) return '';
      if (previousMapId && nextMaps.some((map) => map._id === previousMapId)) return previousMapId;
      return nextMaps[0]._id;
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [mapsData, guidesData, overridesData, optionsData, settingsData, driveStatus] = await Promise.all([
        curriculumService.listMaps({ limit: 100 }),
        curriculumService.listGuides({ limit: 50 }),
        curriculumService.listOverrides({ limit: 50 }),
        curriculumService.listOptions(),
        curriculumService.getSettings(),
        curriculumService.getGoogleDriveStatus().catch(() => ({ connected: false })),
      ]);
      setMaps(mapsData?.items || []);
      setGuides(guidesData?.items || []);
      setOverrides(overridesData?.items || []);
      setSubjects(optionsData?.subjects || []);
      setClasses(optionsData?.classes || []);
      setClassSubjectPairs(optionsData?.classSubjectPairs || []);
      setSettings(settingsData || null);
      setGoogleDriveStatus(driveStatus || { connected: false });
      setSelectedMapId((previousMapId) => {
        const nextMaps = mapsData?.items || [];
        if (!nextMaps.length) return '';
        if (previousMapId && nextMaps.some((map) => map._id === previousMapId)) return previousMapId;
        return nextMaps[0]._id;
      });
    } catch (error) {
      setStatusText(error?.response?.data?.message || t('messages.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('drive_connected') === 'true') {
      setStatusText(t('messages.driveConnected'));
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    const driveError = params.get('drive_error');
    if (driveError) {
      setStatusText(t('messages.driveConnectionFailed', { error: driveError }));
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [t]);

  useEffect(() => {
    if (!selectedMapId) {
      setMapHistory(null);
      return;
    }
    let cancelled = false;
    const loadHistory = async () => {
      try {
        const history = await curriculumService.getMapHistory(selectedMapId);
        if (!cancelled) setMapHistory(history);
      } catch (error) {
        if (!cancelled) setMapHistory(null);
      }
    };
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [selectedMapId]);

  const refreshImportState = useCallback(async (mapId) => {
    if (!mapId) {
      setImportState({ sources: [], jobs: [] });
      return;
    }
    setImportLoading(true);
    try {
      const data = await curriculumService.listMapImportSources(mapId);
      setImportState(data || { sources: [], jobs: [] });
    } catch (error) {
      setStatusText(error?.response?.data?.message || t('messages.importJobsLoadFailed'));
    } finally {
      setImportLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const mapId = editorState?.draft?._id;
    if (!mapId || editorState.mode === 'view') {
      setImportState({ sources: [], jobs: [] });
      return;
    }
    refreshImportState(mapId);
  }, [editorState.mode, editorState?.draft?._id, refreshImportState]);

  const runAction = async (runner, successMessage) => {
    setStatusText('');
    try {
      await runner();
      if (successMessage) setStatusText(successMessage);
    } catch (error) {
      setStatusText(error?.response?.data?.message || t('messages.actionFailed'));
      throw error;
    }
  };

  const handleCreateMap = () => {
    const draft = createEmptyMapDraft({ settings, academicYear: userAcademicYear });
    setEditorState({ mode: 'create', draft });
  };

  const handleEditMap = (map) => {
    setEditorState({ mode: 'edit', draft: { ...toEditorDraftFromMap(map), _id: map._id } });
  };

  const handleSaveMap = async () => {
    if (!editorState?.draft) return;
    setSavingMap(true);
    try {
      const payload = toMapPayloadFromDraft(editorState.draft);
      if (editorState.mode === 'edit' && editorState.draft._id) {
        await runAction(
          () => curriculumService.updateMap(editorState.draft._id, payload),
          t('messages.mapUpdated')
        );
      } else {
        await runAction(
          () => curriculumService.createMap(payload),
          t('messages.mapCreated')
        );
      }
      await refreshMaps();
      setEditorState({ mode: 'view', draft: null });
    } finally {
      setSavingMap(false);
    }
  };

  const handleUploadImportFile = async (file) => {
    const mapId = editorState?.draft?._id;
    if (!mapId || !file) return;
    await runAction(
      async () => {
        await curriculumService.uploadMapImportSource(mapId, file);
        await refreshImportState(mapId);
      },
      t('messages.importQueuedFromFile')
    );
  };

  const handleImportGoogleDoc = async (docRef) => {
    const mapId = editorState?.draft?._id;
    if (!mapId || !docRef) return;
    const payload = /^https?:\/\//i.test(docRef) ? { docUrl: docRef } : { docId: docRef };
    await runAction(
      async () => {
        await curriculumService.importMapSourceFromGoogleDoc(mapId, payload);
        await refreshImportState(mapId);
      },
      t('messages.googleDocImportQueued')
    );
  };

  const handleApplyImportJob = async (jobId, payload) => {
    const mapId = editorState?.draft?._id;
    if (!mapId || !jobId) return;
    await runAction(
      async () => {
        const result = await curriculumService.applyMapImportJob(mapId, jobId, payload);
        if (result?.map) {
          setEditorState((prev) => ({
            ...prev,
            draft: { ...toEditorDraftFromMap(result.map), _id: result.map._id },
          }));
        }
        await refreshImportState(mapId);
        await refreshMaps();
      },
      t('messages.importApplied')
    );
  };

  const handleConnectGoogleDrive = async () => {
    try {
      const result = await curriculumService.getGoogleDriveAuthUrl();
      if (result?.authUrl) {
        window.location.href = result.authUrl;
        return;
      }
      setStatusText(t('messages.driveConnectionStartFailed'));
    } catch (error) {
      setStatusText(error?.response?.data?.message || t('messages.driveConnectFailed'));
    }
  };

  const handleTransition = async (map, action, note) => {
    setTransitionLoading(true);
    try {
      await runAction(
        () => curriculumService.transitionMap(map._id, { action, note }),
        t('messages.workflowActionExecuted', { action: t(`workflow.actions.${action}`, { defaultValue: action }) })
      );
      await refreshMaps();
      const history = await curriculumService.getMapHistory(map._id);
      setMapHistory(history);
    } finally {
      setTransitionLoading(false);
    }
  };

  const handleAddComment = async (map, commentForm) => {
    await runAction(
      () => curriculumService.addMapComment(map._id, {
        scope: {
          targetType: commentForm.targetType,
          sectionId: commentForm.sectionId || null,
          itemId: commentForm.itemId || null,
          fieldKey: commentForm.fieldKey || '',
        },
        commentType: commentForm.commentType || 'comment',
        message: commentForm.message,
      }),
      t('messages.commentAdded')
    );
    const history = await curriculumService.getMapHistory(map._id);
    setMapHistory(history);
    await refreshMaps();
  };

  const handleCreateVersion = async (map) => {
    await runAction(
      () => curriculumService.createMapVersion(map._id),
      t('messages.newVersionCreated')
    );
    await refreshMaps();
  };

  const handleDeleteMap = async (map) => {
    if (!map?._id) return;
    const confirmed = window.confirm(t('messages.deleteConfirm', { title: map.title }));
    if (!confirmed) return;

    await runAction(
      () => curriculumService.deleteMap(map._id),
      t('messages.mapDeleted')
    );

    if (selectedMapId === map._id) setMapHistory(null);
    if (editorState?.draft?._id === map._id) {
      setEditorState({ mode: 'view', draft: null });
    }
    await refreshMaps();
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSettingsSaving(true);
    try {
      await runAction(() => curriculumService.updateSettings(settings), t('messages.settingsUpdated'));
      const refreshed = await curriculumService.getSettings();
      setSettings(refreshed);
    } finally {
      setSettingsSaving(false);
    }
  };

  const mapOptions = useMemo(() => (
    maps.map((map) => ({
      value: map._id,
      label: `${map.title} (${map.classId?.name || t('shared.gradeFallback', { grade: map.grade || '' })})`,
    }))
  ), [maps, t]);

  return (
    <div className="curriculum-page">
      <div className="curriculum-page-header">
        <h1>{t('page.title')}</h1>
        <p>{t('page.description')}</p>
      </div>

      <div className="curriculum-tabs">
        <button type="button" className={activeTab === 'maps' ? 'active' : ''} onClick={() => setActiveTab('maps')}>{t('tabs.maps')}</button>
        <button type="button" className={activeTab === 'guides' ? 'active' : ''} onClick={() => setActiveTab('guides')}>{t('tabs.guides')}</button>
        <button type="button" className={activeTab === 'overrides' ? 'active' : ''} onClick={() => setActiveTab('overrides')}>{t('tabs.overrides')}</button>
        <button type="button" className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')}>{t('tabs.settings')}</button>
      </div>

      {statusText && <div className="curriculum-status">{statusText}</div>}
      {loading && <div className="curriculum-status">{t('shared.loading')}</div>}

      {activeTab === 'maps' && (
        <div className="curriculum-maps-layout">
          <CurriculumMapListPanel
            maps={filteredMaps}
            filters={mapFilters}
            onFilterChange={(key, value) => setMapFilters((prev) => ({ ...prev, [key]: value }))}
            selectedMapId={selectedMapId}
            onSelectMap={(map) => setSelectedMapId(map._id)}
            onCreateMap={handleCreateMap}
            onEditMap={handleEditMap}
            onDeleteMap={handleDeleteMap}
            onDownloadMap={(mapId, format) => curriculumService.downloadMap(mapId, format)}
            canEditMap={canEditMap}
            canDeleteMap={canDeleteMap}
          />

          {editorState.mode !== 'view' && editorState.draft ? (
            <CurriculumMapEditorPanel
              draft={editorState.draft}
              setDraft={(updater) => {
                setEditorState((prev) => ({
                  ...prev,
                  draft: typeof updater === 'function' ? updater(prev.draft) : updater,
                }));
              }}
              classes={classes}
              subjects={subjects}
              classSubjectPairs={classSubjectPairs}
              isTeacherLimited={isTeacher && !canManageMap}
              activeTemplate={activeTemplate}
              importState={importState}
              importLoading={importLoading}
              googleDriveStatus={googleDriveStatus}
              onRefreshImportState={() => refreshImportState(editorState?.draft?._id)}
              onUploadImportFile={handleUploadImportFile}
              onImportGoogleDoc={handleImportGoogleDoc}
              onApplyImportJob={handleApplyImportJob}
              onConnectGoogleDrive={handleConnectGoogleDrive}
              onSave={handleSaveMap}
              onCancel={() => setEditorState({ mode: 'view', draft: null })}
              saving={savingMap}
            />
          ) : (
            <CurriculumMapDetailPanel
              map={selectedMap}
              history={mapHistory}
              onEditMap={handleEditMap}
              onDownloadMap={(mapId, format) => curriculumService.downloadMap(mapId, format)}
              onTransition={handleTransition}
              onAddComment={handleAddComment}
              onCreateVersion={handleCreateVersion}
              onDeleteMap={handleDeleteMap}
              canEditMap={canEditMap}
              canReviewMap={canReviewMap}
              canPublishMap={canPublishMap}
              canDeleteMap={canDeleteMap}
              transitionLoading={transitionLoading}
            />
          )}
        </div>
      )}

      {activeTab === 'guides' && (
        <section className="curriculum-section">
          <h2>{t('guides.title')}</h2>
          {canEditGuide && (
            <form
              className="curriculum-form"
              onSubmit={async (event) => {
                event.preventDefault();
                await runAction(async () => {
                  await curriculumService.createGuide({
                    mapId: guideForm.mapId,
                    classId: guideForm.classId,
                    term: guideForm.term,
                    title: guideForm.title,
                  });
                  setGuideForm(DEFAULT_GUIDE_FORM);
                  const guidesData = await curriculumService.listGuides({ limit: 50 });
                  setGuides(guidesData?.items || []);
                }, t('messages.guideCreated'));
              }}
            >
              <div className="form-grid">
                <label>
                  {t('shared.map')}
                  <select value={guideForm.mapId} onChange={(event) => setGuideForm((prev) => ({ ...prev, mapId: event.target.value }))}>
                    <option value="">{t('shared.selectMap')}</option>
                    {mapOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  {t('shared.class')}
                  <select value={guideForm.classId} onChange={(event) => setGuideForm((prev) => ({ ...prev, classId: event.target.value }))}>
                    <option value="">{t('shared.selectClass')}</option>
                    {classes.map((cls) => <option key={cls._id} value={cls._id}>{cls.name}</option>)}
                  </select>
                </label>
                <label>
                  {t('shared.term')}
                  <input value={guideForm.term} onChange={(event) => setGuideForm((prev) => ({ ...prev, term: event.target.value }))} />
                </label>
                <label>
                  {t('shared.title')}
                  <input value={guideForm.title} onChange={(event) => setGuideForm((prev) => ({ ...prev, title: event.target.value }))} />
                </label>
              </div>
              <button type="submit">{t('guides.create')}</button>
            </form>
          )}

          <div className="curriculum-list">
            {guides.map((guide) => (
              <article key={guide._id} className="curriculum-card">
                <div>
                  <h3>{guide.title}</h3>
                  <p>
                    {guide.academicYear}
                    {' • '}
                    {guide.term}
                    {' • '}
                    {guide.classId?.name || t('shared.class')}
                    {' • '}
                    {guide.subject?.name || t('shared.subject')}
                  </p>
                  <p>
                    {t('shared.statusLabel', { status: t(`status.${guide.status}`, { defaultValue: guide.status }) })}
                    {' • '}
                    {t('guides.syncLabel', { syncStatus: guide.syncStatus })}
                  </p>
                </div>
                <div className="card-actions">
                  <button type="button" onClick={() => curriculumService.downloadGuide(guide._id, 'csv')}>CSV</button>
                  <button type="button" onClick={() => curriculumService.downloadGuide(guide._id, 'pdf')}>PDF</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'overrides' && (
        <section className="curriculum-section">
          <h2>{t('overrides.title')}</h2>
          <form
            className="curriculum-form"
            onSubmit={async (event) => {
              event.preventDefault();
              await runAction(async () => {
                await curriculumService.createOverride({
                  pacingGuideId: overrideForm.pacingGuideId,
                  pacingEntryId: overrideForm.pacingEntryId,
                  reason: overrideForm.reason,
                  requestPayload: {
                    weekNumber: Number(overrideForm.weekNumber),
                    focus: overrideForm.focus,
                    objectives: overrideForm.objectives.split(',').map((item) => item.trim()).filter(Boolean),
                    assessment: overrideForm.assessment,
                    notes: overrideForm.notes,
                  },
                });
                setOverrideForm(DEFAULT_OVERRIDE_FORM);
                const overridesData = await curriculumService.listOverrides({ limit: 50 });
                setOverrides(overridesData?.items || []);
              }, t('messages.overrideSubmitted'));
            }}
          >
            <div className="form-grid">
              <label>
                {t('overrides.pacingGuide')}
                <select value={overrideForm.pacingGuideId} onChange={(event) => setOverrideForm((prev) => ({ ...prev, pacingGuideId: event.target.value }))}>
                  <option value="">{t('shared.selectGuide')}</option>
                  {guides.map((guide) => <option key={guide._id} value={guide._id}>{guide.title}</option>)}
                </select>
              </label>
              <label>
                {t('overrides.entryId')}
                <input value={overrideForm.pacingEntryId} onChange={(event) => setOverrideForm((prev) => ({ ...prev, pacingEntryId: event.target.value }))} />
              </label>
              <label>
                {t('overrides.weekNumber')}
                <input type="number" min={1} max={53} value={overrideForm.weekNumber} onChange={(event) => setOverrideForm((prev) => ({ ...prev, weekNumber: event.target.value }))} />
              </label>
              <label>
                {t('overrides.focus')}
                <input value={overrideForm.focus} onChange={(event) => setOverrideForm((prev) => ({ ...prev, focus: event.target.value }))} />
              </label>
            </div>
            <label>
              {t('overrides.objectives')}
              <input value={overrideForm.objectives} onChange={(event) => setOverrideForm((prev) => ({ ...prev, objectives: event.target.value }))} />
            </label>
            <label>
              {t('overrides.assessment')}
              <input value={overrideForm.assessment} onChange={(event) => setOverrideForm((prev) => ({ ...prev, assessment: event.target.value }))} />
            </label>
            <label>
              {t('overrides.reason')}
              <textarea value={overrideForm.reason} onChange={(event) => setOverrideForm((prev) => ({ ...prev, reason: event.target.value }))} />
            </label>
            <label>
              {t('shared.notes')}
              <textarea value={overrideForm.notes} onChange={(event) => setOverrideForm((prev) => ({ ...prev, notes: event.target.value }))} />
            </label>
            <button type="submit">{t('overrides.submit')}</button>
          </form>

          <div className="curriculum-list">
            {overrides.map((override) => (
              <article key={override._id} className="curriculum-card">
                <div>
                  <h3>{t('overrides.cardTitle', { id: override._id?.slice(-6) })}</h3>
                  <p>
                    {t('shared.statusLabel', { status: t(`status.${override.status}`, { defaultValue: override.status }) })}
                    {' • '}
                    {t('overrides.weekLine', { week: override.requestPayload?.weekNumber })}
                  </p>
                  <p>{override.reason}</p>
                </div>
                {canApproveOverride && override.status === 'pending' && (
                  <div className="card-actions">
                    <button type="button" onClick={() => runAction(() => curriculumService.approveOverride(override._id), t('messages.overrideApproved'))}>{t('workflow.actions.approve')}</button>
                    <button type="button" onClick={() => runAction(() => curriculumService.rejectOverride(override._id), t('messages.overrideRejected'))}>{t('workflow.actions.reject')}</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'settings' && settings && (
        <CurriculumSettingsPanel
          settings={settings}
          setSettings={setSettings}
          onSave={handleSaveSettings}
          canManageSettings={canManageSettings}
          saving={settingsSaving}
        />
      )}
    </div>
  );
};

export default CurriculumPage;
