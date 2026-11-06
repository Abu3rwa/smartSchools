const CustomPromptSection = ({ value, onChange }) => (
  <div className="rg-panel">
    <div className="rg-panel-head">
      <h3>Custom Prompt</h3>
      <span className="rg-hint">Optional</span>
    </div>
    <div className="rg-field">
      <label className="rg-label" htmlFor="customPrompt">
        Additional instructions for the AI
      </label>
      <textarea
        id="customPrompt"
        name="customPrompt"
        className="rg-textarea"
        value={value}
        onChange={onChange}
        placeholder="Leave empty to use the default prompt..."
        rows={4}
      />
    </div>
  </div>
);

export default CustomPromptSection;
