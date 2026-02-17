import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import api from '../config/api';
import toast from 'react-hot-toast';
import {
    HiOutlineCode,
    HiOutlineSearch,
    HiOutlineClipboardCopy,
    HiOutlineCheckCircle,
    HiOutlineChevronDown,
    HiOutlineChevronRight
} from 'react-icons/hi';
import './ApiDocsPage.css';

const METHOD_COLORS = {
    GET: '#10b981',
    POST: '#3b82f6',
    PUT: '#f59e0b',
    PATCH: '#8b5cf6',
    DELETE: '#ef4444'
};

const ApiDocsPage = () => {
    const navigate = useNavigate();
    const user = useSelector((state) => state.auth.user);
    const [docs, setDocs] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedCategories, setExpandedCategories] = useState({});
    const [copiedPath, setCopiedPath] = useState(null);

    useEffect(() => {
        if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
            navigate('/portal/dashboard');
            return;
        }
        fetchDocs();
    }, [user, navigate]);

    useEffect(() => {
        // Apply theme to document element for CSS variables
        const theme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', theme);
    }, []);

    const fetchDocs = async () => {
        setLoading(true);
        try {
            const response = await api.get('/docs');
            setDocs(response.data.data);
            
            const initialExpanded = {};
            response.data.data.categories.forEach((cat, index) => {
                initialExpanded[index] = index === 0;
            });
            setExpandedCategories(initialExpanded);
        } catch (error) {
            toast.error('Failed to load API documentation');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const toggleCategory = (index) => {
        setExpandedCategories(prev => ({
            ...prev,
            [index]: !prev[index]
        }));
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        setCopiedPath(text);
        toast.success('Copied to clipboard!');
        setTimeout(() => setCopiedPath(null), 2000);
    };

    const filterEndpoints = (category) => {
        if (!searchTerm) return category.endpoints;
        
        const term = searchTerm.toLowerCase();
        return category.endpoints.filter(endpoint => 
            endpoint.path.toLowerCase().includes(term) ||
            endpoint.description.toLowerCase().includes(term) ||
            endpoint.method.toLowerCase().includes(term)
        );
    };

    const filteredCategories = docs?.categories.filter(category => {
        if (!searchTerm) return true;
        return filterEndpoints(category).length > 0;
    }) || [];

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
                                                            style={{ backgroundColor: METHOD_COLORS[endpoint.method] }}
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
