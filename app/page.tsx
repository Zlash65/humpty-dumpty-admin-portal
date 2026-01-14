import LoginForm from './LoginForm';
import { getSettings } from '@/app/actions/settings';

export default async function LoginPage() {
  const settings = await getSettings();

  return <LoginForm settings={settings} />;
}
