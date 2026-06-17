import { saveStoryContent } from '@/lib/storyPersistence';
import { recordAuditEvent } from '@/lib/audit';
import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    const route = '/api/stories/draft';
    const { token, content } = await request.json();

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

    const { error: storyError } = await saveStoryContent(tokenData.question_id, content);

    if (storyError) {
        console.error('Failed to save draft:', storyError);
        await recordAuditEvent({
            event_type: 'story_saved',
            status: 'error',
            route,
            question_id: tokenData.question_id,
            token,
            message: storyError.message ?? 'Failed to save draft',
            metadata: { mode: 'draft' },
        });
        return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 });
    }

    await recordAuditEvent({
        event_type: 'story_saved',
        status: 'success',
        route,
        question_id: tokenData.question_id,
        token,
        metadata: { mode: 'draft' },
    });

    return NextResponse.json({ success: true });
}
