class 'SequencePatcher'
local m_Logger = Logger("SequencePatcher", true)

function SequencePatcher:__init()
	m_Logger:Write("Initializing Patches")
end

function SequencePatcher:PatchSequence(p_SequenceEntityData)
	local s_Instance = SequenceEntityData(p_SequenceEntityData)
	s_Instance:MakeWritable()
	s_Instance.propertyTracks:clear()
	s_Instance.customSequenceTracks:clear()
end

return SequencePatcher()
