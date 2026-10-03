import './EmailLanguageControl.css';

const EmailLanguageControl = ({
    language,
    onLanguageChange,
    rememberLanguage,
    onRememberLanguageChange,
    name = 'email-language'
}) => (
    <div className="email-language-control">
        <fieldset>
            <legend>Language</legend>
            <label>
                <input
                    type="radio"
                    name={name}
                    checked={language === 'en'}
                    onChange={() => onLanguageChange('en')}
                />
                English
            </label>
            <label>
                <input
                    type="radio"
                    name={name}
                    checked={language === 'ar'}
                    onChange={() => onLanguageChange('ar')}
                />
                العربية
            </label>
        </fieldset>
        <label className="email-language-control__remember">
            <input
                type="checkbox"
                checked={rememberLanguage}
                onChange={(event) => onRememberLanguageChange(event.target.checked)}
            />
            Set this as my default email language
        </label>
    </div>
);

export default EmailLanguageControl;
