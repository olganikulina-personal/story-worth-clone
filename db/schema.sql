-- Storyworth Clone — Supabase Schema
-- Run this in the Supabase SQL editor to set up the database from scratch.

CREATE TABLE public.questions (
  id integer NOT NULL DEFAULT nextval('questions_id_seq'::regclass),
  prompt text NOT NULL,
  is_sent boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  order_index integer,
  CONSTRAINT questions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.access_tokens (
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  question_id integer,
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
  is_used boolean DEFAULT false,
  CONSTRAINT access_tokens_pkey PRIMARY KEY (token),
  CONSTRAINT access_tokens_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id)
);

CREATE TABLE public.stories (
  id integer NOT NULL DEFAULT nextval('stories_id_seq'::regclass),
  question_id integer,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT stories_pkey PRIMARY KEY (id),
  CONSTRAINT stories_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id)
);
