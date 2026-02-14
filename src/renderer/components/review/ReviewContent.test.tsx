// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { ReviewContent } from './ReviewContent'
import type { ReviewData, ReviewComparison, PendingComment } from '../../types/review'

afterEach(() => {
  cleanup()
})

function makeReviewData(overrides: Partial<ReviewData> = {}): ReviewData {
  return {
    version: 1,
    generatedAt: '2024-01-01T00:00:00.000Z',
    overview: { purpose: 'Fix bugs', approach: 'Refactoring' },
    changePatterns: [],
    potentialIssues: [],
    designDecisions: [],
    ...overrides,
  }
}

describe('ReviewContent', () => {
  it('renders overview section', () => {
    render(
      <ReviewContent
        reviewData={makeReviewData()}
        comparison={null}
        comments={[]}
        unpushedCount={0}
        directory="/test"
        onClickLocation={vi.fn()}
        onDeleteComment={vi.fn()}
      />
    )
    expect(screen.getByText('Overview')).toBeTruthy()
    expect(screen.getByText('Fix bugs')).toBeTruthy()
    expect(screen.getByText('Refactoring')).toBeTruthy()
  })

  it('renders change patterns section', () => {
    render(
      <ReviewContent
        reviewData={makeReviewData({
          changePatterns: [
            { id: 'cp-1', title: 'API Refactor', description: 'Changed endpoints', locations: [] },
          ],
        })}
        comparison={null}
        comments={[]}
        unpushedCount={0}
        directory="/test"
        onClickLocation={vi.fn()}
        onDeleteComment={vi.fn()}
      />
    )
    expect(screen.getByText('Change Patterns')).toBeTruthy()
    // Section is collapsed by default, click to expand
    fireEvent.click(screen.getByText('Change Patterns'))
    expect(screen.getByText('API Refactor')).toBeTruthy()
    expect(screen.getByText('Changed endpoints')).toBeTruthy()
  })

  it('renders potential issues with severity badges', () => {
    render(
      <ReviewContent
        reviewData={makeReviewData({
          potentialIssues: [
            { id: 'pi-1', severity: 'warning', title: 'Missing null check', description: 'Could crash', locations: [] },
            { id: 'pi-2', severity: 'info', title: 'Naming convention', description: 'Could be clearer', locations: [] },
          ],
        })}
        comparison={null}
        comments={[]}
        unpushedCount={0}
        directory="/test"
        onClickLocation={vi.fn()}
        onDeleteComment={vi.fn()}
      />
    )
    expect(screen.getByText('Potential Issues')).toBeTruthy()
    // Section is collapsed by default, click to expand
    fireEvent.click(screen.getByText('Potential Issues'))
    expect(screen.getByText('Missing null check')).toBeTruthy()
    expect(screen.getByText('warning')).toBeTruthy()
    expect(screen.getByText('info')).toBeTruthy()
  })

  it('renders design decisions with alternatives', () => {
    render(
      <ReviewContent
        reviewData={makeReviewData({
          designDecisions: [
            { id: 'dd-1', title: 'Use Zustand', description: 'For state management', alternatives: ['Redux', 'MobX'], locations: [] },
          ],
        })}
        comparison={null}
        comments={[]}
        unpushedCount={0}
        directory="/test"
        onClickLocation={vi.fn()}
        onDeleteComment={vi.fn()}
      />
    )
    expect(screen.getByText('Design Decisions')).toBeTruthy()
    // Section is collapsed by default, click to expand
    fireEvent.click(screen.getByText('Design Decisions'))
    expect(screen.getByText('Use Zustand')).toBeTruthy()
    expect(screen.getByText('Redux, MobX')).toBeTruthy()
  })

  it('renders location links and handles clicks', () => {
    const onClickLocation = vi.fn()
    render(
      <ReviewContent
        reviewData={makeReviewData({
          changePatterns: [
            { id: 'cp-1', title: 'Change', description: 'Desc', locations: [{ file: 'src/app.ts', startLine: 10, endLine: 20 }] },
          ],
        })}
        comparison={null}
        comments={[]}
        unpushedCount={0}
        directory="/test"
        onClickLocation={onClickLocation}
        onDeleteComment={vi.fn()}
      />
    )
    // Open the section first
    fireEvent.click(screen.getByText('Change Patterns'))
    const link = screen.getByText('src/app.ts:10-20')
    fireEvent.click(link)
    expect(onClickLocation).toHaveBeenCalledWith({ file: 'src/app.ts', startLine: 10, endLine: 20 })
  })

  it('renders pending comments section', () => {
    const comments: PendingComment[] = [
      { id: 'c-1', file: '/test/src/app.ts', line: 5, body: 'Consider adding error handling', createdAt: '2024-01-01', pushed: false },
      { id: 'c-2', file: '/test/src/utils.ts', line: 10, body: 'Good pattern', createdAt: '2024-01-01', pushed: true },
    ]
    render(
      <ReviewContent
        reviewData={makeReviewData()}
        comparison={null}
        comments={comments}
        unpushedCount={1}
        directory="/test"
        onClickLocation={vi.fn()}
        onDeleteComment={vi.fn()}
      />
    )
    expect(screen.getByText('Pending Comments')).toBeTruthy()
  })

  it('shows pushed badge for pushed comments', () => {
    const comments: PendingComment[] = [
      { id: 'c-1', file: '/test/src/app.ts', line: 5, body: 'Good stuff', createdAt: '2024-01-01', pushed: true },
    ]
    render(
      <ReviewContent
        reviewData={makeReviewData()}
        comparison={null}
        comments={comments}
        unpushedCount={0}
        directory="/test"
        onClickLocation={vi.fn()}
        onDeleteComment={vi.fn()}
      />
    )
    // Open the section
    fireEvent.click(screen.getByText('Pending Comments'))
    expect(screen.getByText('pushed')).toBeTruthy()
  })

  it('calls onDeleteComment when delete button is clicked', () => {
    const onDeleteComment = vi.fn()
    const comments: PendingComment[] = [
      { id: 'c-1', file: '/test/src/app.ts', line: 5, body: 'Delete me', createdAt: '2024-01-01' },
    ]
    render(
      <ReviewContent
        reviewData={makeReviewData()}
        comparison={null}
        comments={comments}
        unpushedCount={1}
        directory="/test"
        onClickLocation={vi.fn()}
        onDeleteComment={onDeleteComment}
      />
    )
    fireEvent.click(screen.getByText('Pending Comments'))
    const deleteBtn = screen.getByTitle('Delete comment')
    fireEvent.click(deleteBtn)
    expect(onDeleteComment).toHaveBeenCalledWith('c-1')
  })

  it('renders comparison section when comparison data exists', () => {
    const comparison: ReviewComparison = {
      newCommitsSince: ['abc123'],
      newFileChanges: [],
      requestedChangeStatus: [
        {
          change: { id: 'rc-1', description: 'Add tests' },
          status: 'addressed',
          notes: 'Tests added',
        },
      ],
    }
    render(
      <ReviewContent
        reviewData={makeReviewData()}
        comparison={comparison}
        comments={[]}
        unpushedCount={0}
        directory="/test"
        onClickLocation={vi.fn()}
        onDeleteComment={vi.fn()}
      />
    )
    expect(screen.getByText('Changes Since Last Review')).toBeTruthy()
  })

  it('renders changesSinceLastReview section from reviewData', () => {
    render(
      <ReviewContent
        reviewData={makeReviewData({
          changesSinceLastReview: {
            summary: 'Several improvements made',
            responsesToComments: [{ comment: 'Fix bug', response: 'Fixed in latest commit' }],
            otherNotableChanges: ['Added logging'],
          },
        })}
        comparison={null}
        comments={[]}
        unpushedCount={0}
        directory="/test"
        onClickLocation={vi.fn()}
        onDeleteComment={vi.fn()}
      />
    )
    expect(screen.getByText('Since Last Review')).toBeTruthy()
    expect(screen.getByText('Several improvements made')).toBeTruthy()
  })

  it('hides potential issues section when empty', () => {
    render(
      <ReviewContent
        reviewData={makeReviewData({ potentialIssues: [] })}
        comparison={null}
        comments={[]}
        unpushedCount={0}
        directory="/test"
        onClickLocation={vi.fn()}
        onDeleteComment={vi.fn()}
      />
    )
    expect(screen.queryByText('Potential Issues')).toBeNull()
  })

  it('hides design decisions section when empty', () => {
    render(
      <ReviewContent
        reviewData={makeReviewData({ designDecisions: [] })}
        comparison={null}
        comments={[]}
        unpushedCount={0}
        directory="/test"
        onClickLocation={vi.fn()}
        onDeleteComment={vi.fn()}
      />
    )
    expect(screen.queryByText('Design Decisions')).toBeNull()
  })
})
