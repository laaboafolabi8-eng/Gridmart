import { useState, useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem, Order, Node, TimeSlot, Product, ChatMessage } from './mockData';
import { products, nodes } from './mockData';

const CART_KEY = 'gridmart_cart';
const ORDERS_KEY = 'gridmart_orders';
const SELECTED_NODE_KEY = 'gridmart_selected_node';
const CHAT_KEY = 'gridmart_chat';

// Zustand store for selected node - determines which node's inventory to show
interface SelectedNodeStore {
  selectedNodeId: string | null;
  setSelectedNode: (nodeId: string | null) => void;
}

const useSelectedNodeStore = create<SelectedNodeStore>()(
  persist(
    (set) => ({
      selectedNodeId: null,
      setSelectedNode: (nodeId: string | null) => set({ selectedNodeId: nodeId }),
    }),
    {
      name: SELECTED_NODE_KEY,
    }
  )
);

export function useSelectedNode() {
  const { selectedNodeId, setSelectedNode } = useSelectedNodeStore();
  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) || null : null;
  
  return {
    selectedNodeId,
    selectedNode,
    setSelectedNode,
  };
}

// Zustand store for chat messages
interface ChatStore {
  messages: ChatMessage[];
  addMessage: (orderId: string, senderType: 'buyer' | 'node', senderName: string, message: string) => void;
  getMessagesForOrder: (orderId: string) => ChatMessage[];
}

const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      messages: [],
      addMessage: (orderId: string, senderType: 'buyer' | 'node', senderName: string, message: string) => {
        const newMessage: ChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          orderId,
          senderType,
          senderName,
          message,
          timestamp: new Date().toISOString(),
        };
        set((state) => ({
          messages: [...state.messages, newMessage]
        }));
      },
      getMessagesForOrder: (orderId: string) => {
        return get().messages.filter(m => m.orderId === orderId);
      },
    }),
    {
      name: CHAT_KEY,
    }
  )
);

export function useChat(orderId: string) {
  const { messages, addMessage } = useChatStore();
  const orderMessages = messages.filter(m => m.orderId === orderId);
  
  const sendMessage = (senderType: 'buyer' | 'node', senderName: string, message: string) => {
    addMessage(orderId, senderType, senderName, message);
  };

  return {
    messages: orderMessages,
    sendMessage,
  };
}

// Zustand store for cart - shared across all components
interface CartStore {
  cart: CartItem[];
  addToCart: (product: Product, quantity?: number, selectedColor?: { name: string; hex: string }) => void;
  removeFromCart: (productId: string, selectedColorHex?: string) => void;
  updateQuantity: (productId: string, quantity: number, selectedColorHex?: string) => void;
  clearCart: () => void;
}

const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      cart: [],
      addToCart: (product: Product, quantity: number = 1, selectedColor?: { name: string; hex: string }) => {
        set((state) => {
          // Match by product ID and color (if colors are available)
          const existing = state.cart.find(item => 
            item.product.id === product.id && 
            item.selectedColor?.hex === selectedColor?.hex
          );
          if (existing) {
            return {
              cart: state.cart.map(item =>
                item.product.id === product.id && item.selectedColor?.hex === selectedColor?.hex
                  ? { ...item, quantity: item.quantity + quantity }
                  : item
              )
            };
          }
          return { cart: [...state.cart, { product, quantity, selectedColor }] };
        });
      },
      removeFromCart: (productId: string, selectedColorHex?: string) => {
        set((state) => ({
          cart: state.cart.filter(item => 
            !(item.product.id === productId && item.selectedColor?.hex === selectedColorHex)
          )
        }));
      },
      updateQuantity: (productId: string, quantity: number, selectedColorHex?: string) => {
        if (quantity <= 0) {
          get().removeFromCart(productId, selectedColorHex);
          return;
        }
        set((state) => ({
          cart: state.cart.map(item =>
            item.product.id === productId && item.selectedColor?.hex === selectedColorHex 
              ? { ...item, quantity } 
              : item
          )
        }));
      },
      clearCart: () => set({ cart: [] }),
    }),
    {
      name: CART_KEY,
    }
  )
);

export function useCart() {
  const { cart, addToCart, removeFromCart, updateQuantity, clearCart } = useCartStore();
  
  const cartTotal = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return {
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    cartTotal,
    cartCount,
  };
}

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>(() => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem(ORDERS_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  }, [orders]);

  const createOrder = (
    items: CartItem[],
    node: Node,
    timeSlot: TimeSlot,
    buyerName: string,
    buyerEmail: string
  ): Order => {
    const total = items.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0
    );

    const order: Order = {
      id: `ORD-${String(orders.length + 1).padStart(3, '0')}`,
      buyerName,
      buyerEmail,
      items,
      node,
      timeSlot,
      status: 'paid',
      total,
      createdAt: new Date().toISOString(),
      pickupCode: `GM-${Math.floor(1000 + Math.random() * 9000)}`,
    };

    const newOrders = [order, ...orders];
    setOrders(newOrders);
    // Immediately persist to localStorage to avoid race condition on navigation
    localStorage.setItem(ORDERS_KEY, JSON.stringify(newOrders));
    return order;
  };

  const updateOrderStatus = (orderId: string, status: Order['status']) => {
    setOrders(prev =>
      prev.map(order =>
        order.id === orderId ? { ...order, status } : order
      )
    );
  };

  const getNodeOrders = (nodeId: string) => {
    return orders.filter(order => order.node.id === nodeId);
  };

  return {
    orders,
    createOrder,
    updateOrderStatus,
    getNodeOrders,
  };
}

export function useNodeAvailability(nodeId: string) {
  const node = nodes.find(n => n.id === nodeId);
  const [availability, setAvailability] = useState<TimeSlot[]>(
    node?.availability || []
  );

  const toggleSlot = (slotId: string) => {
    setAvailability(prev =>
      prev.map(slot =>
        slot.id === slotId ? { ...slot, available: !slot.available } : slot
      )
    );
  };

  const setSlotAvailable = (slotId: string, available: boolean) => {
    setAvailability(prev =>
      prev.map(slot =>
        slot.id === slotId ? { ...slot, available } : slot
      )
    );
  };

  return {
    availability,
    toggleSlot,
    setSlotAvailable,
  };
}

export function useInventory() {
  const [inventory, setInventory] = useState(products);

  const updateStock = (productId: string, nodeId: string, change: number) => {
    setInventory(prev =>
      prev.map(product => {
        if (product.id !== productId) return product;
        return {
          ...product,
          inventory: product.inventory.map(inv =>
            inv.nodeId === nodeId
              ? { ...inv, quantity: Math.max(0, inv.quantity + change) }
              : inv
          ),
        };
      })
    );
  };

  const getNodeInventory = (nodeId: string) => {
    return inventory
      .filter(p => p.inventory.some(inv => inv.nodeId === nodeId))
      .map(p => ({
        ...p,
        stockAtNode: p.inventory.find(inv => inv.nodeId === nodeId)?.quantity || 0,
      }));
  };

  return {
    inventory,
    updateStock,
    getNodeInventory,
  };
}

// Serving city store
const CITY_KEY = 'gridmart_selected_city';

interface ServingCity {
  id: string;
  name: string;
  province: string;
  latitude: string;
  longitude: string;
  mapLat?: string | null;
  mapLng?: string | null;
  mapZoom?: string | null;
  isAvailable: boolean;
  sortOrder: number;
}

interface CityStore {
  selectedCityId: string | null;
  cities: ServingCity[];
  setCities: (cities: ServingCity[]) => void;
  setSelectedCityId: (id: string | null) => void;
}

const useCityStore = create<CityStore>()(
  persist(
    (set) => ({
      selectedCityId: null,
      cities: [],
      setCities: (cities: ServingCity[]) => set({ cities }),
      setSelectedCityId: (id: string | null) => set({ selectedCityId: id }),
    }),
    {
      name: CITY_KEY,
      partialize: (state) => ({ selectedCityId: state.selectedCityId }),
    }
  )
);

export function useServingCities() {
  const { selectedCityId, cities, setCities, setSelectedCityId } = useCityStore();
  const selectedCity = cities.find(c => c.id === selectedCityId) || cities.find(c => c.isAvailable) || cities[0] || null;

  return {
    selectedCityId: selectedCity?.id || null,
    selectedCity,
    cities,
    setCities,
    setSelectedCityId,
  };
}

// Wishlist store
const WISHLIST_KEY = 'gridmart_wishlist';

interface WishlistStore {
  wishlist: Product[];
  addToWishlist: (product: Product) => void;
  removeFromWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  clearWishlist: () => void;
}

const useWishlistStore = create<WishlistStore>()(
  persist(
    (set, get) => ({
      wishlist: [],
      addToWishlist: (product: Product) => {
        set((state) => {
          if (state.wishlist.some(p => p.id === product.id)) {
            return state;
          }
          return { wishlist: [...state.wishlist, product] };
        });
      },
      removeFromWishlist: (productId: string) => {
        set((state) => ({
          wishlist: state.wishlist.filter(p => p.id !== productId)
        }));
      },
      isInWishlist: (productId: string) => {
        return get().wishlist.some(p => p.id === productId);
      },
      clearWishlist: () => set({ wishlist: [] }),
    }),
    {
      name: WISHLIST_KEY,
    }
  )
);

export function useWishlist() {
  const { wishlist, addToWishlist, removeFromWishlist, isInWishlist, clearWishlist } = useWishlistStore();
  
  return {
    wishlist,
    addToWishlist,
    removeFromWishlist,
    isInWishlist,
    clearWishlist,
  };
}
