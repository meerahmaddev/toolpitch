import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { Project } from '@/lib/models/project.model';
import { requireSessionUser } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = await requireSessionUser(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const name = body?.name;
  if (!name) {
    return NextResponse.json({ message: 'Project name is required' }, { status: 400 });
  }

  await connectToDatabase();
  const newProject = new Project({ name, userEmail: user.email });
  await newProject.save();

  return NextResponse.json({ message: 'Project created', project: newProject });
}

export async function GET(request: Request) {
  const user = await requireSessionUser(request);
  if (user instanceof NextResponse) return user;

  await connectToDatabase();
  const projects = await Project.find({ userEmail: user.email }).sort({ createdAt: -1 });

  return NextResponse.json({ projects });
}
