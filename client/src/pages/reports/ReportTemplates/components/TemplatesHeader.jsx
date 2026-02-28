const TemplatesHeader = ({ onCreate }) => (
  <div className="templates-header">
    <div>
      <h1>Report Templates</h1>
      <p>Create and manage custom AI report templates</p>
    </div>
    <button className="btn btn-primary" onClick={onCreate}>
      + Create Template
    </button>
  </div>
);

export default TemplatesHeader;