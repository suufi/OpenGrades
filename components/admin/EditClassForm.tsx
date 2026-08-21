import { useState } from 'react'

import { Button, Group, Stack, Switch, Textarea, TextInput } from '@mantine/core'

import { IClass } from '@/types'

export function EditClassForm({
    classEntry,
    saving,
    onSave,
    onCancel
}: {
    classEntry: IClass
    saving: boolean
    onSave: (payload: { subjectTitle?: string; instructors?: string[]; aliases?: string[]; description?: string; display?: boolean }) => Promise<void>
    onCancel: () => void
}) {
    const [subjectTitle, setSubjectTitle] = useState(classEntry.subjectTitle ?? '')
    const [instructorsText, setInstructorsText] = useState((classEntry.instructors ?? []).join('\n'))
    const [aliasesText, setAliasesText] = useState((classEntry.aliases ?? []).join('\n'))
    const [description, setDescription] = useState(classEntry.description ?? '')
    const [display, setDisplay] = useState(classEntry.display !== false)

    const handleSubmit = () => {
        const instructors = instructorsText.split('\n').map(s => s.trim()).filter(Boolean)
        const aliases = aliasesText.split('\n').map(s => s.trim()).filter(Boolean)
        onSave({ subjectTitle: subjectTitle.trim() || undefined, instructors, aliases, description: description.trim() || undefined, display })
    }

    return (
        <Stack gap="md">
            <TextInput label="Title" value={subjectTitle} onChange={e => setSubjectTitle(e.target.value)} placeholder="Subject title" />
            <Textarea label="Instructors (one per line)" value={instructorsText} onChange={e => setInstructorsText(e.target.value)} placeholder="One name per line" minRows={2} />
            <Textarea label="Aliases (one per line)" value={aliasesText} onChange={e => setAliasesText(e.target.value)} placeholder="e.g. 6.006, 18.410" minRows={2} />
            <Textarea label="Description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Course description" minRows={4} />
            <Switch label="Display (visible on site)" checked={display} onChange={e => setDisplay(e.target.checked)} />
            <Group justify="flex-end" gap="xs">
                <Button variant="default" onClick={onCancel} disabled={saving}>Cancel</Button>
                <Button onClick={handleSubmit} loading={saving}>Save changes</Button>
            </Group>
        </Stack>
    )
}
