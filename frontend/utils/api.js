const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  
  const headers = {
    ...options.headers,
  };
  
  // Automatically add Content-Type JSON headers if it's not a FormData payload
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  
  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });
    
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    
    if (!response.ok) {
      const errorMessage = (data && data.detail) || response.statusText || 'An unexpected error occurred';
      const error = new Error(errorMessage);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    
    return data;
  } catch (err) {
    if (err.status) throw err;
    // Handle offline / connection failures
    const error = new Error(err.message || 'Network connection failed');
    error.status = 500;
    throw error;
  }
}

export const api = {
  get: (path, options) => request(path, { method: 'GET', ...options }),
  post: (path, body, options) => request(path, { method: 'POST', body, ...options }),
  put: (path, body, options) => request(path, { method: 'PUT', body, ...options }),
  patch: (path, body, options) => request(path, { method: 'PATCH', body, ...options }),
  delete: (path, options) => request(path, { method: 'DELETE', ...options }),
};
