import React from 'react';
import { useTranslation } from 'react-i18next';

const StudentFormModal = ({
    showModal,
    setShowModal,
    isEditing,
    formData,
    setFormData,
    classes,
    departments,
    resetForm,
    handleSubmit
}) => {
    const { t } = useTranslation(['students']);
    if (!showModal) return null;

    return (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{isEditing ? t('students:modal.editTitle') : t('students:modal.createTitle')}</h3>
                    <button className="modal-close" onClick={() => { setShowModal(false); resetForm(); }}>&times;</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <h4 className="section-title">{t('students:form.studentInformation')}</h4>
                        <div className="form-row">
                            <div className="form-group">
                                <label>{t('students:form.firstName')}</label>
                                <input
                                    type="text"
                                    value={formData.firstName}
                                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>{t('students:form.lastName')}</label>
                                <input
                                    type="text"
                                    value={formData.lastName}
                                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>{t('students:form.studentId')}</label>
                                <input
                                    type="text"
                                    value={formData.studentId}
                                    onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>{t('students:form.email')}</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>{t('students:form.dateOfBirth')}</label>
                                <input
                                    type="date"
                                    value={formData.dateOfBirth}
                                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>{t('students:form.gender')}</label>
                                <select
                                    value={formData.gender}
                                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                                    required
                                >
                                    <option value="">{t('students:form.selectGender')}</option>
                                    <option value="male">{t('students:genders.male')}</option>
                                    <option value="female">{t('students:genders.female')}</option>
                                    <option value="other">{t('students:genders.other')}</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>{t('students:form.assignToClass')}</label>
                                <select
                                    value={formData.currentClass}
                                    onChange={(e) => setFormData({ ...formData, currentClass: e.target.value })}
                                >
                                    <option value="">{t('students:form.selectClass')}</option>
                                    {classes.map(cls => (
                                        <option key={cls._id} value={cls._id}>{cls.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>{t('students:form.department')}</label>
                                <select
                                    value={formData.department}
                                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                                >
                                    <option value="">{t('students:form.noDepartment')}</option>
                                    {departments.map((d) => (
                                        <option key={d._id} value={d._id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <h4 className="section-title mt-lg">{t('students:form.parentGuardianInformation')}</h4>

                        <div className="form-group">
                            <label>{t('students:form.motherName')}</label>
                            <input
                                type="text"
                                value={formData.parentInfo.motherName}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    parentInfo: { ...formData.parentInfo, motherName: e.target.value }
                                })}
                            />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>{t('students:form.motherPhone')}</label>
                                <input
                                    type="tel"
                                    value={formData.parentInfo.motherPhone}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        parentInfo: { ...formData.parentInfo, motherPhone: e.target.value }
                                    })}
                                />
                            </div>
                            <div className="form-group">
                                <label>{t('students:form.motherEmail')}</label>
                                <input
                                    type="email"
                                    value={formData.parentInfo.motherEmail}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        parentInfo: { ...formData.parentInfo, motherEmail: e.target.value }
                                    })}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>{t('students:form.fatherName')}</label>
                            <input
                                type="text"
                                value={formData.parentInfo.fatherName}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    parentInfo: { ...formData.parentInfo, fatherName: e.target.value }
                                })}
                            />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>{t('students:form.fatherPhone')}</label>
                                <input
                                    type="tel"
                                    value={formData.parentInfo.fatherPhone}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        parentInfo: { ...formData.parentInfo, fatherPhone: e.target.value }
                                    })}
                                />
                            </div>
                            <div className="form-group">
                                <label>{t('students:form.fatherEmail')}</label>
                                <input
                                    type="email"
                                    value={formData.parentInfo.fatherEmail}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        parentInfo: { ...formData.parentInfo, fatherEmail: e.target.value }
                                    })}
                                />
                            </div>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); resetForm(); }}>
                            {t('common:actions.cancel')}
                        </button>
                        <button type="submit" className="btn btn-primary">
                            {isEditing ? t('students:actions.updateStudent') : t('students:actions.addStudent')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default StudentFormModal;
