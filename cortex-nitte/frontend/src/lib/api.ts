const host = window.location.hostname || 'localhost'
const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:'
const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:'

export const API_BASE = import.meta.env.VITE_API_URL || `${protocol}//${host}:8000`
export const WS_URL = import.meta.env.VITE_WS_URL || `${wsProtocol}//${host}:8000/ws`

