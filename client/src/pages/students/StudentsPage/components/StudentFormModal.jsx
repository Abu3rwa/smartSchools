import React from 'react';

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
    if (!showModal) return null;

    return (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{isEditing ? 'Edit Student' : 'Add New Student'}</h3>
                    <button className="modal-close" onClick={() => { setShowModal(false); resetForm(); }}>&times;</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <h4 className="section-title">Student Information</h4>
                        <div className="form-row">
                            <div className="form-group">
                                <label>First Name *</label>
                                <input
                                    type="text"
                                    value={formData.firstName}
                                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Last Name *</label>
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
                                <label>Student ID *</label>
                                <input
                                    type="text"
                                    value={formData.studentId}
                                    onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Email</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Date of Birth *</label>
                                <input
                                    type="date"
                                    value={formData.dateOfBirth}
                                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Gender *</label>
                                <select
                                    value={formData.gender}
                                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                                    required
                                >
                                    <option value="">Select Gender *</option>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Assign to Class</label>
                                <select
                                    value={formData.currentClass}
                                    onChange={(e) => setFormData({ ...formData, currentClass: e.target.value })}
                                >
                                    <option value="">Select Class</option>
                                    {classes.map(cls => (
                                        <option key={cls._id} value={cls._id}>{cls.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Department</label>
                                <select
                                    value={formData.department}
                                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                                >
                                    <option value="">— No department —</option>
                                    {departments.map((d) => (
                                        <option key={d._id} value={d._id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <h4 className="section-title mt-lg">Parent/Guardian Information</h4>

                        <div className="form-group">
                            <label>Mother's Name</label>
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
                                <label>Mother's Phone</label>
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
                                <label>Mother's Email</label>
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
                            <label>Father's Name</label>
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
                                <label>Phone</label>
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
                                <label>Email</label>
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
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                            {isEditing ? 'Update Student' : 'Add Student'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default StudentFormModal;
