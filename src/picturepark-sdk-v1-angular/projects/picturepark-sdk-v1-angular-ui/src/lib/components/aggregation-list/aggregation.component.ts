import { Input, OnChanges, Output, EventEmitter, SimpleChanges } from '@angular/core';
import { FormControl } from '@angular/forms';
import { debounce, map, flatMap } from 'rxjs/operators';
import { timer, Observable, from } from 'rxjs';

import {
  AggregationFilter, AggregationResult, AggregatorBase,
  AggregationResultItem, TermsAggregator, ObjectAggregationResult
} from '@picturepark/sdk-v1-angular';
import { BaseComponent } from '../base.component';


export abstract class AggregationComponent extends BaseComponent implements OnChanges {
  // Used for performing aggregate request (autocomplete functionality).
  @Input()
  public query = '';

  // Used for performing aggregate request (autocomplete functionality).
  @Input()
  globalAggregationFilters: AggregationFilter[] = [];

  @Input()
  aggregator: AggregatorBase;

  @Input()
  aggregationResult: AggregationResult | null = null;

  @Output()
  aggregationFiltersChange: EventEmitter<AggregationFilter[]> = new EventEmitter();

  public pagingSize = 0;

  public aggregationsFiltersCount = 0;

  public aggregationQuery = new FormControl();

  public expandedAggregator: TermsAggregator;

  public expandedAggregationResult: AggregationResult | null = null;

  public autoCompleteOptions: Observable<AggregationResultItem[]>;

  public constructor() {
    super();
    this.autoCompleteOptions = this.aggregationQuery.valueChanges.pipe(
      debounce(() => timer(500)),
      map((value: string | AggregationResultItem) => typeof value === 'string' ? value : (value.name || '')),
      flatMap(value => this.searchAggregator(value)));
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['aggregator']) {
      this.expandedAggregator = this.expandAggregator(this.aggregator);
      this.pagingSize = this.expandedAggregator.size || 0;
    }

    if (changes['aggregationResult']) {
      this.updateAggregationResult(this.aggregationResult);
      this.aggregationQuery.setValue('');
    }

    if (changes['globalAggregationFilters']) {
      this.aggregationsFiltersCount = this.globalAggregationFilters.filter(
        (item) => item.aggregationName === this.aggregator.name).length;
    }
  }

  protected abstract fetchData(): Observable<ObjectAggregationResult>;

  public loadMore() {
    this.expandedAggregator.size = (this.expandedAggregator.size || 0) + this.pagingSize;

    const fetchDataSubscription = this.fetchData().subscribe(result => {
      this.updateAggregationResult(result.aggregationResults ? result.aggregationResults[0] || null : null);
    });
    this.subscription.add(fetchDataSubscription);
  }

  public loadLess() {
    this.expandedAggregator.size = (this.expandedAggregator.size || 0) - this.pagingSize;

    const fetchDataSubscription = this.fetchData().subscribe(result => {
      this.updateAggregationResult(result.aggregationResults ? result.aggregationResults[0] || null : null);
    });
    this.subscription.add(fetchDataSubscription);
  }

  public searchAggregator(query: string): Observable<AggregationResultItem[]> {
    if (query === '') {
      return from([]);
    }

    const sizeStore = this.expandedAggregator.size;

    this.expandedAggregator.searchString = query;
    this.expandedAggregator.size = this.pagingSize;

    const observableResult = this.fetchData()
      .pipe(map((result) => {

        if (result.aggregationResults !== undefined) {
          const items = this.expandAggregationResult(result.aggregationResults[0]).aggregationResultItems || [];

          const currentSelectedValues = this.expandedAggregationResult!.aggregationResultItems ?
            this.expandedAggregationResult!.aggregationResultItems!.filter(agr => agr.active === true) : [];

          return items.filter((item) => !currentSelectedValues.some((value => value.name === item.name)));
        }

        return [];
      }));

    this.expandedAggregator.searchString = undefined;
    this.expandedAggregator.size = sizeStore;

    return observableResult;
  }

  public queryDisplay(aggregationResultItem: AggregationResultItem): string | undefined {
    return aggregationResultItem ? aggregationResultItem.name : undefined;
  }

  public autoCompleteOptionSelected(value: AggregationResultItem) {
    const filters = this.expandedAggregationResult!.aggregationResultItems ?
      this.expandedAggregationResult!.aggregationResultItems!
        .filter(agr => agr.active === true && agr.filter)
        .map(agr => agr.filter as AggregationFilter) : [];

    if (value.filter !== undefined) {
      filters.push(value.filter);
    }

    this.aggregationFiltersChange.emit(filters);
  }

  public selectionChanged(changedItem: AggregationResultItem): void {
    changedItem.active = !changedItem.active;

    const filters = this.expandedAggregationResult!.aggregationResultItems ?
      this.expandedAggregationResult!.aggregationResultItems!
        .filter(agr => agr.active === true && agr.filter)
        .map(agr => agr.filter as AggregationFilter) : [];

    this.aggregationFiltersChange.emit(filters);
  }

  public get showLess(): boolean {
    return !!this.expandedAggregationResult && !!this.expandedAggregationResult.aggregationResultItems && this.expandedAggregationResult.aggregationResultItems.filter(x => x && !x.active).length > this.pagingSize;
  }

  public get active(): boolean {
    return !!this.expandedAggregationResult && !!this.expandedAggregationResult.aggregationResultItems && this.expandedAggregationResult.aggregationResultItems.filter(x => x && x.count > 0 || x.active).length >= 1;
  }

  public trackByName(index, aggregationResultItem: AggregationResultItem) {
    return aggregationResultItem.name;
  }

  private updateAggregationResult(aggregationResult: AggregationResult | null) {
    this.expandedAggregationResult = aggregationResult ? this.expandAggregationResult(aggregationResult) : null;
  }

  private expandAggregator(aggregator: AggregatorBase): TermsAggregator {
    if (aggregator.aggregators && aggregator.aggregators.length > 0) {
      return this.expandAggregator(aggregator.aggregators[0]);
    }

    return aggregator as TermsAggregator;
  }

  private expandAggregationResult(aggregationResult: AggregationResult): AggregationResult {
    if (
      aggregationResult &&
      aggregationResult.aggregationResultItems &&
      aggregationResult.aggregationResultItems[0] &&
      aggregationResult.aggregationResultItems[0].aggregationResults &&
      aggregationResult.aggregationResultItems[0].aggregationResults![0]) {
      return this.expandAggregationResult(aggregationResult.aggregationResultItems[0].aggregationResults![0]);
    }

    return aggregationResult;
  }
}
