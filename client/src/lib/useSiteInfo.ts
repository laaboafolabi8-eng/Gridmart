import { useQuery } from '@tanstack/react-query';

const DEFAULTS = {
  email: 'admin@gridmart.ca',
  phone: '(519) 919-7764',
  address: '3176 Walker Rd, Windsor, ON N8W 3R5',
};

export function useSiteInfo() {
  const { data: settings = {} } = useQuery<Record<string, string>>({
    queryKey: ['site-settings'],
    queryFn: async () => {
      const res = await fetch('/api/site-settings');
      return res.json();
    },
  });

  const email = settings.contactEmail || DEFAULTS.email;
  const phone = settings.contactPhone || DEFAULTS.phone;
  const address = settings.storefrontAddress || DEFAULTS.address;
  const phoneRaw = '+1' + phone.replace(/\D/g, '').slice(-10);

  return { email, phone, address, phoneRaw };
}
