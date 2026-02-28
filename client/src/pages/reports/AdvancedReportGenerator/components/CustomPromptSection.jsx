const CustomPromptSection = ({ value, onChange }) => (
  <div className="form-section">
    <h3>Custom Prompt (Optional)</h3>
    <div className="form-group">
      <label htmlFor="customPrompt">Customize the AI prompt for this report</label>
      <textarea
        id="customPrompt"
        name="customPrompt"
        className="custom-prompt-editor"
        value={value}
        onChange={onChange}
        placeholder="Leave empty to use default prompt..."
      />
    </div>
  </div>
);

export default CustomPromptSection;