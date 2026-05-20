import CuestionarioPublicoClient from './CuestionarioPublicoClient';

export default async function CuestionarioPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CuestionarioPublicoClient token={token} />;
}
