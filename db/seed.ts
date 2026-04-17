import { db } from "./index";
import { users, products, nodes, inventory, nodeAvailability } from "../shared/schema";
import bcrypt from "bcrypt";

async function seed() {
  console.log("Seeding database...");

  // Create demo users
  const hashedPassword = await bcrypt.hash("demo123", 10);
  const hashedAdminPassword = await bcrypt.hash("admin123", 10);
  const hashedNodePassword = await bcrypt.hash("node123", 10);

  const [buyerUser, adminUser, nodeUser1, nodeUser2, nodeUser3, nodeUser4] = await db.insert(users).values([
    {
      email: "buyer@example.com",
      password: hashedPassword,
      name: "Alex Johnson",
      type: "buyer"
    },
    {
      email: "admin@gridmart.com",
      password: hashedAdminPassword,
      name: "Admin User",
      type: "admin"
    },
    {
      email: "node1@example.com",
      password: hashedNodePassword,
      name: "Sarah Chen",
      type: "node"
    },
    {
      email: "node2@example.com",
      password: hashedNodePassword,
      name: "Mike Rodriguez",
      type: "node"
    },
    {
      email: "node3@example.com",
      password: hashedNodePassword,
      name: "Jamie Park",
      type: "node"
    },
    {
      email: "node4@example.com",
      password: hashedNodePassword,
      name: "Taylor Brooks",
      type: "node"
    }
  ]).returning();

  console.log("Created users");

  // Create products
  const productData = await db.insert(products).values([
    {
      name: "Wireless Earbuds Pro",
      description: "Premium true wireless earbuds with active noise cancellation and 24hr battery life.",
      price: "129.99",
      image: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&h=400&fit=crop",
      category: "Audio"
    },
    {
      name: "USB-C Fast Charger 65W",
      description: "Compact GaN charger with multiple ports. Powers laptops, tablets, and phones.",
      price: "49.99",
      image: "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=400&h=400&fit=crop",
      category: "Accessories"
    },
    {
      name: "Mechanical Keyboard RGB",
      description: "Hot-swappable mechanical keyboard with customizable RGB lighting and aluminum frame.",
      price: "89.99",
      image: "https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?w=400&h=400&fit=crop",
      category: "Electronics"
    },
    {
      name: "Portable SSD 1TB",
      description: "Ultra-fast portable SSD with USB 3.2 Gen 2. Read speeds up to 1050MB/s.",
      price: "119.00",
      image: "https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=400&h=400&fit=crop",
      category: "Electronics"
    },
    {
      name: "Gaming Controller",
      description: "Wireless gaming controller with haptic feedback. Compatible with PC, console, and mobile.",
      price: "69.99",
      image: "https://images.unsplash.com/photo-1592840496694-26d035b52b48?w=400&h=400&fit=crop",
      category: "Gaming"
    },
    {
      name: "Smart Watch Series 5",
      description: "Fitness tracking, heart rate monitoring, GPS, and 5-day battery life.",
      price: "249.00",
      image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=400&fit=crop",
      category: "Electronics"
    },
    {
      name: "Webcam 4K HDR",
      description: "Professional 4K webcam with auto-focus, noise-canceling mic, and low-light correction.",
      price: "159.99",
      image: "https://images.unsplash.com/photo-1587826080692-f439cd0b70da?w=400&h=400&fit=crop",
      category: "Electronics"
    },
    {
      name: "Bluetooth Speaker",
      description: "Waterproof portable speaker with 360° sound and 20-hour playtime.",
      price: "79.99",
      image: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=400&h=400&fit=crop",
      category: "Audio"
    }
  ]).returning();

  console.log("Created products");

  // Create nodes
  const nodeData = await db.insert(nodes).values([
    {
      userId: nodeUser1.id,
      name: "Sarah's Tech Hub",
      address: "123 Bedford Ave",
      city: "Brooklyn, NY",
      pickupInstructions: "Ring doorbell. Orders are in the secured cabinet on the porch."
    },
    {
      userId: nodeUser2.id,
      name: "Mike's Electronics Depot",
      address: "456 Wythe Ave",
      city: "Brooklyn, NY",
      pickupInstructions: "Text when arriving. Meet at garage entrance."
    },
    {
      userId: nodeUser3.id,
      name: "Corner Tech Stop",
      address: "789 Kent Ave",
      city: "Brooklyn, NY",
      pickupInstructions: "Pickup window on the side. Open Mon-Sat 9am-6pm."
    },
    {
      userId: nodeUser4.id,
      name: "The Gadget Garage",
      address: "234 Grand St",
      city: "Brooklyn, NY",
      pickupInstructions: "Orders in the smart locker. Code sent via text."
    }
  ]).returning();

  console.log("Created nodes");

  // Create inventory - distribute products across nodes
  const inventoryData = [
    // Wireless Earbuds at multiple nodes
    { productId: productData[0].id, nodeId: nodeData[0].id, quantity: 8 },
    { productId: productData[0].id, nodeId: nodeData[1].id, quantity: 3 },
    { productId: productData[0].id, nodeId: nodeData[2].id, quantity: 12 },
    
    // USB-C Charger
    { productId: productData[1].id, nodeId: nodeData[0].id, quantity: 15 },
    { productId: productData[1].id, nodeId: nodeData[2].id, quantity: 10 },
    
    // Mechanical Keyboard
    { productId: productData[2].id, nodeId: nodeData[0].id, quantity: 6 },
    { productId: productData[2].id, nodeId: nodeData[1].id, quantity: 4 },
    { productId: productData[2].id, nodeId: nodeData[2].id, quantity: 8 },
    { productId: productData[2].id, nodeId: nodeData[3].id, quantity: 5 },
    
    // Portable SSD
    { productId: productData[3].id, nodeId: nodeData[1].id, quantity: 5 },
    { productId: productData[3].id, nodeId: nodeData[3].id, quantity: 7 },
    
    // Gaming Controller
    { productId: productData[4].id, nodeId: nodeData[0].id, quantity: 10 },
    { productId: productData[4].id, nodeId: nodeData[2].id, quantity: 8 },
    
    // Smart Watch
    { productId: productData[5].id, nodeId: nodeData[0].id, quantity: 4 },
    { productId: productData[5].id, nodeId: nodeData[1].id, quantity: 6 },
    { productId: productData[5].id, nodeId: nodeData[2].id, quantity: 3 },
    { productId: productData[5].id, nodeId: nodeData[3].id, quantity: 5 },
    
    // Webcam
    { productId: productData[6].id, nodeId: nodeData[0].id, quantity: 7 },
    { productId: productData[6].id, nodeId: nodeData[3].id, quantity: 9 },
    
    // Bluetooth Speaker
    { productId: productData[7].id, nodeId: nodeData[1].id, quantity: 12 },
    { productId: productData[7].id, nodeId: nodeData[2].id, quantity: 8 },
  ];

  await db.insert(inventory).values(inventoryData);
  console.log("Created inventory");

  // Create node availability (Monday-Saturday, 9am-6pm for all nodes)
  const availabilityData: any[] = [];
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  for (const node of nodeData) {
    for (const day of days) {
      availabilityData.push({
        nodeId: node.id,
        dayOfWeek: day,
        startTime: '09:00',
        endTime: '18:00',
        enabled: true
      });
    }
  }

  await db.insert(nodeAvailability).values(availabilityData);
  console.log("Created node availability");

  console.log("Database seeded successfully!");
  console.log("\nDemo accounts:");
  console.log("Buyer: buyer@example.com / demo123");
  console.log("Admin: admin@gridmart.com / admin123");
  console.log("Node: node1@example.com / node123");
}

seed()
  .catch((error) => {
    console.error("Error seeding database:", error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
