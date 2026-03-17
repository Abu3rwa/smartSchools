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
  const canManageSettings = isAdminLike || hasAnyPermission(permissions, [
    PERMISSIONS.MANAGE_SCHOOL_SETTINGS,
    PERMISSIONS.CONFIGURE_CURRICULUM_MAP_TEMPLATES,
  ]);

  const [activeTab, setActiveTab] = useState('maps');
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [maps, setMaps] = useState([]);
  const [mapHistory, setMapHistory] = useState(null);
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
      const [mapsData, optionsData, settingsData, driveStatus] = await Promise.all([
        curriculumService.listMaps({ limit: 100 }),
        curriculumService.listOptions(),
        curriculumService.getSettings(),
        curriculumService.getGoogleDriveStatus().catch(() => ({ connected: false })),
      ]);
      setMaps(mapsData?.items || []);
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

  const handleRefineObjectives = async (payload) => {
    let result = null;
    await runAction(
      async () => {
        result = await curriculumService.refineObjectives(payload);
      },
      t('messages.objectivesRefined', { defaultValue: 'Objectives refined with AI.' })
    );
    return result;
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

  return (
    <div className="curriculum-page">
      <div className="curriculum-page-header">
        <h1>{t('page.title')}</h1>
        <p>{t('page.description')}</p>
      </div>

      <div className="curriculum-tabs">
        <button type="button" className={activeTab === 'maps' ? 'active' : ''} onClick={() => setActiveTab('maps')}>{t('tabs.maps')}</button>
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
              onRefineObjectives={handleRefineObjectives}
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
