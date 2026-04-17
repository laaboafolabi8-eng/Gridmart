import { useQuery } from '@tanstack/react-query';

export interface NodeApplicationConfig {
  heroTitle: string;
  heroSubtitle: string;
  aboutTitle: string;
  aboutText: string;
  successTitle: string;
  successMessage: string;
}

const defaultConfig: NodeApplicationConfig = {
  heroTitle: "Become a Node Host",
  heroSubtitle: "Earn money by hosting a neighborhood pickup point",
  aboutTitle: "About the Pilot (read before continuing)",
  aboutText: `Node hosts store products delivered to their location and facilitate scheduled handoffs for orders placed on the platform.

This is a paid opportunity with no upfront costs and does not involve selling products, recruiting others, or soliciting customers.

Hosts must have space for at least one inventory crate, comparable in footprint to a small suitcase. This crate can fit in a closet, on a shelf, or in another suitable storage area. Hosts begin with a single crate. Additional crates may be added subject to host's capabilities.

Inventory consists of low-value, everyday consumer items such as household goods and small electronics accessories. All items are pre-packaged and sealed in advance.

Hosts are compensated with a base monthly storage fee, plus an additional amount per completed handoff. Full compensation details are shared after initial screening.

All handoffs are scheduled in advance within the host's provided availability windows.`,
  successTitle: "Application Received!",
  successMessage: "Thanks for applying, selected applicants will receive further details.",
};

export function useNodeApplicationConfig() {
  const { data: settings = {}, isLoading } = useQuery<Record<string, string>>({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const res = await fetch('/api/admin/settings');
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const config: NodeApplicationConfig = {
    heroTitle: settings.node_app_hero_title || defaultConfig.heroTitle,
    heroSubtitle: settings.node_app_hero_subtitle || defaultConfig.heroSubtitle,
    aboutTitle: settings.node_app_about_title || defaultConfig.aboutTitle,
    aboutText: settings.node_app_about_text || defaultConfig.aboutText,
    successTitle: settings.node_app_success_title || defaultConfig.successTitle,
    successMessage: settings.node_app_success_message || defaultConfig.successMessage,
  };

  return { config, isLoading, defaultConfig };
}
