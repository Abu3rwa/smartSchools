import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineAcademicCap, HiOutlineUserGroup } from 'react-icons/hi';

const RoleChoice = ({ role, onChoose }) => {
    const { t } = useTranslation(['auth']);

    return (
        <fieldset className="role-choice">
            <legend className="role-choice-legend">{t('auth:login.role.legend')}</legend>

            <label className={`role-option ${role === 'student' ? 'is-selected' : ''}`}>
                <input
                    type="radio"
                    name="login-role"
                    value="student"
                    checked={role === 'student'}
                    onChange={() => onChoose('student')}
                />
                <span className="role-option-icon"><HiOutlineUserGroup size={24} /></span>
                <span className="role-option-copy">
                    <span className="role-option-title">{t('auth:login.role.studentTitle')}</span>
                    <span className="role-option-body">{t('auth:login.role.studentBody')}</span>
                </span>
            </label>

            <label className={`role-option ${role === 'teacher' ? 'is-selected' : ''}`}>
                <input
                    type="radio"
                    name="login-role"
                    value="teacher"
                    checked={role === 'teacher'}
                    onChange={() => onChoose('teacher')}
                />
                <span className="role-option-icon"><HiOutlineAcademicCap size={24} /></span>
                <span className="role-option-copy">
                    <span className="role-option-title">{t('auth:login.role.teacherTitle')}</span>
                    <span className="role-option-body">{t('auth:login.role.teacherBody')}</span>
                </span>
            </label>
        </fieldset>
    );
};

export default RoleChoice;
