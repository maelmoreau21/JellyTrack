import { redirect } from 'next/navigation';

export const dynamic = "force-dynamic";

export default function MediaPage() {
    // Redirect to the new collections subpage by default
    redirect('/media/collections');
}
