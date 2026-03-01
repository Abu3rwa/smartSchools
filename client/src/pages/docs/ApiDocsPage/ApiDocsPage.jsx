import {
    HiOutlineCode,
    HiOutlineSearch,
    HiOutlineClipboardCopy,
    HiOutlineCheckCircle,
    HiOutlineChevronDown,
    HiOutlineChevronRight
} from 'react-icons/hi';
import { useApiDocsData } from './hooks/useApiDocsData.js';
import { METHOD_COLORS } from './constants.js';
import './ApiDocsPage.css';

const ApiDocsPage = () => {
    const {
        docs,
        loading,
        searchTerm,
        setSearchTerm,
        expandedCategories,
        copiedPath,
        toggleCategory,
        copyToClipboard,
        filterEndpoints,
        filteredCategories,
    } = useApiDocsData();

    if (loading) {
        return (
            <div className="api-docs-page">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading API documentation...</p>
                </div>
            </div>
        );
    }

    if (!docs) {
        return (
            <div className="api-docs-page">
                <div className="error-state">
                    <p>Failed to load documentation</p>
                </div>
            </div>
        );
    }

    return (
        <div className="api-docs-page">
            <div className="docs-header">
                <div className="header-content">
                    <div className="header-title">
                        <HiOutlineCode size={32} />
                        <div>
                            <h1>{docs.title}</h1>
                            <p className="version">Version {docs.version}</p>
                        </div>
                    </div>
                    <p className="description">{docs.description}</p>
                    <div className="base-url">
                        <span className="label">Base URL:</span>
                        <code>{docs.baseUrl}</code>
                        <button 
                            className="copy-btn"
                            onClick={() => copyToClipboard(docs.baseUrl)}
                        >
                            {copiedPath === docs.baseUrl ? (
                                <HiOutlineCheckCircle size={18} />
                            ) : (
                                <HiOutlineClipboardCopy size={18} />
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <div className="docs-content">
                <div className="search-bar">
                    <HiOutlineSearch size={20} />
                    <input
                        type="text"
                        placeholder="Search endpoints..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="categories-list">
                    {filteredCategories.map((category, categoryIndex) => {
                        const filteredEndpointsList = filterEndpoints(category);
                        const isExpanded = expandedCategories[categoryIndex];

                        return (
                            <div key={categoryIndex} className="category-section">
                                <div 
                                    className="category-header"
                                    onClick={() => toggleCategory(categoryIndex)}
                                >
                                    <div className="category-title">
                                        {isExpanded ? (
                                            <HiOutlineChevronDown size={20} />
                                        ) : (
                                            <HiOutlineChevronRight size={20} />
                                        )}
                                        <h2>{category.name}</h2>
                                        <span className="endpoint-count">
                                            {filteredEndpointsList.length} endpoint{filteredEndpointsList.length !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                    <p className="category-description">{category.description}</p>
                                </div>

                                {isExpanded && (
                                    <div className="endpoints-list">
                                        {filteredEndpointsList.map((endpoint, endpointIndex) => (
                                            <div key={endpointIndex} className="endpoint-card">
                                                <div className="endpoint-header">
                                                    <div className="endpoint-title">
                                                        <span 
                                                            className="method-badge"
                                                            style={{ backgroundColor: METHOD_COLORS[endpoint.method] || '#6b7280' }}
                                                        >
                                                            {endpoint.method}
                                                        </span>
                                                        <code className="endpoint-path">{endpoint.path}</code>
                                                        <button
                                                            className="copy-btn-small"
                                                            onClick={() => copyToClipboard(docs.baseUrl + endpoint.path)}
                                                            title="Copy full URL"
                                                        >
                                                            {copiedPath === docs.baseUrl + endpoint.path ? (
                                                                <HiOutlineCheckCircle size={16} />
                                                            ) : (
                                                                <HiOutlineClipboardCopy size={16} />
                                                            )}
                                                        </button>
                                                    </div>
                                                    <p className="endpoint-description">{endpoint.description}</p>
                                                </div>

                                                <div className="endpoint-details">
                                                    <div className="detail-row">
                                                        <span className="detail-label">Authentication:</span>
                                                        <span className="detail-value auth-badge">
                                                            {endpoint.auth}
                                                        </span>
                                                    </div>

                                                    {endpoint.query && (
                                                        <div className="detail-section">
                                                            <h4>Query Parameters</h4>
                                                            <div className="params-list">
                                                                {Object.entries(endpoint.query).map(([key, value]) => (
                                                                    <div key={key} className="param-item">
                                                                        <code className="param-name">{key}</code>
                                                                        <span className="param-type">{value}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {endpoint.body && (
                                                        <div className="detail-section">
                                                            <h4>Request Body</h4>
                                                            <div className="code-block">
                                                                <pre>{JSON.stringify(endpoint.body, null, 2)}</pre>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {endpoint.response && (
                                                        <div className="detail-section">
                                                            <h4>Response Example</h4>
                                                            <div className="code-block">
                                                                <pre>{JSON.stringify(endpoint.response, null, 2)}</pre>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {filteredCategories.length === 0 && (
                    <div className="empty-state">
                        <HiOutlineSearch size={48} />
                        <p>No endpoints found matching "{searchTerm}"</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ApiDocsPage;
