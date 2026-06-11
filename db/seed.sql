-- Storyworth Clone — Sample Questions Seed
-- Run this after schema.sql to populate starter questions.
-- Questions are sent in order_index order, one per week.

INSERT INTO public.questions (prompt, is_sent, order_index) VALUES
  ('Where were you born, and what do you remember about your childhood home?', false, 1),
  ('What was your favourite game to play as a child, and who did you play it with?', false, 2),
  ('Describe the home you grew up in. What did it look like, smell like, feel like?', false, 3),
  ('Who was your best friend when you were young, and what did you love about them?', false, 4),
  ('What was the first job you ever had, and what did you learn from it?', false, 5),
  ('How did you meet your husband? What do you remember about your first impression of him?', false, 6),
  ('What was the happiest day of your life?', false, 7),
  ('What is the hardest thing you have ever had to do?', false, 8),
  ('What was happening in the world when you were growing up, and how did it affect your family?', false, 9),
  ('What traditions did your family have that you still think about today?', false, 10),
  ('What do you wish you had known when you were twenty years old?', false, 11),
  ('What is something you are most proud of in your life?', false, 12),
  ('Tell me about a person who changed your life.', false, 13),
  ('What were your dreams when you were young? Did they come true?', false, 14),
  ('What advice would you give to your grandchildren about how to live a good life?', false, 15);
