import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    const { token, content } = await request.json();
    const updatedAt = new Date().toISOString();

    const { data: tokenData, error: tokenError } = await supabase
        .from('access_tokens')
        .select('question_id, is_used, expires_at')
        .eq('token', token)
        .single();

    if (tokenError || !tokenData) {
        return NextResponse.json({ error: 'Invalid link' }, { status: 403 });
    }

    const { count } = await supabase
        .from('access_tokens')
        .select('*', { count: 'exact', head: true })
        .eq('question_id', tokenData.question_id)
        .gt('expires_at', tokenData.expires_at);

    const isLocked = (count ?? 0) > 0;

    if (isLocked) {
        return NextResponse.json({ error: 'This story has been locked.' }, { status: 409 });
    }

    if (!tokenData.is_used && new Date(tokenData.expires_at) < new Date()) {
        return NextResponse.json({ error: 'Invalid or expired link' }, { status: 403 });
    }

    const { error: storyError } = await supabase
        .from('stories')
        .upsert([{ question_id: tokenData.question_id, content, updated_at: updatedAt }], { onConflict: 'question_id' });

    if (storyError) {
        return NextResponse.json({ error: 'Failed to save story' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
