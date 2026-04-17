import { type User } from '@shared/schema';

const API_BASE = '/api';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }
  return response.json();
}

// Auth API
export const authApi = {
  async getSession(): Promise<{ user: User } | null> {
    const response = await fetch(`${API_BASE}/auth/session`, {
      credentials: 'include',
    });
    if (response.status === 401) return null;
    return handleResponse(response);
  },

  async login(email: string, password: string): Promise<{ user: User }> {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    });
    return handleResponse(response);
  },

  async logout(): Promise<void> {
    const response = await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    return handleResponse(response);
  },
};

// Products API
export const productsApi = {
  async getAll() {
    const response = await fetch(`${API_BASE}/products`);
    return handleResponse(response);
  },

  async getById(id: string) {
    const response = await fetch(`${API_BASE}/products/${id}`);
    return handleResponse(response);
  },

  async create(data: any) {
    const response = await fetch(`${API_BASE}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async update(id: string, data: any) {
    const response = await fetch(`${API_BASE}/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async delete(id: string) {
    const response = await fetch(`${API_BASE}/products/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(response);
  },
};

// Nodes API
export const nodesApi = {
  async getAll() {
    const response = await fetch(`${API_BASE}/nodes`);
    return handleResponse(response);
  },

  async getById(id: string) {
    const response = await fetch(`${API_BASE}/nodes/${id}`);
    return handleResponse(response);
  },

  async create(data: any) {
    const response = await fetch(`${API_BASE}/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async update(id: string, data: any) {
    const response = await fetch(`${API_BASE}/nodes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async updateAvailability(id: string, data: any) {
    const response = await fetch(`${API_BASE}/nodes/${id}/availability`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },
};

// Inventory API
export const inventoryApi = {
  async getByNode(nodeId: string) {
    const response = await fetch(`${API_BASE}/inventory/node/${nodeId}`);
    return handleResponse(response);
  },

  async getByProduct(productId: string) {
    const response = await fetch(`${API_BASE}/inventory/product/${productId}`);
    return handleResponse(response);
  },

  async update(productId: string, nodeId: string, quantity: number) {
    const response = await fetch(`${API_BASE}/inventory`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, nodeId, quantity }),
    });
    return handleResponse(response);
  },
};

// Orders API
export const ordersApi = {
  async create(data: any) {
    const response = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async getForBuyer(buyerId: string) {
    const response = await fetch(`${API_BASE}/orders/buyer/${buyerId}`);
    return handleResponse(response);
  },

  async getForNode(nodeId: string) {
    const response = await fetch(`${API_BASE}/orders/node/${nodeId}`);
    return handleResponse(response);
  },

  async updateStatus(orderId: string, status: string) {
    const response = await fetch(`${API_BASE}/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    return handleResponse(response);
  },
};
